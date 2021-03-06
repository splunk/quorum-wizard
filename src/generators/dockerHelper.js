import {
  copyFile, formatNewLine, libRootDir, readFileToString, writeFile,
} from '../utils/fileUtils'
import { getFullNetworkPath } from './networkCreator'
import { buildCakeshopDir } from './cakeshopHelper'
import { loadTesseraPublicKey } from './transactionManager'
import { isCakeshop, isTessera } from '../model/NetworkConfig'
import { info } from '../utils/log'
import { joinPath, removeTrailingSlash } from '../utils/pathUtils'
import { buildDockerIp, cidrhost } from '../utils/subnetUtils'
import { isQuorum260Plus } from './binaryHelper'

let DOCKER_REGISTRY

export function setDockerRegistry(registry) {
  if (!registry) {
    DOCKER_REGISTRY = ''
    return
  }

  if (registry.indexOf('http') === 0) {
    throw new Error('Docker registry url should NOT include http(s):// at the beginning')
  }

  // make sure that there is a trailing slash
  DOCKER_REGISTRY = `${removeTrailingSlash(registry)}/`

  info(`Using custom docker registry: ${DOCKER_REGISTRY}`)
}

export function getDockerRegistry() {
  return DOCKER_REGISTRY
}

export function buildDockerCompose(config) {
  const hasTessera = isTessera(config.network.transactionManager)
  const hasCakeshop = isCakeshop(config.network.cakeshop)
  const hasSplunk = config.network.splunk

  const quorumDefinitions = readFileToString(joinPath(
    libRootDir(),
    'lib/docker-compose-definitions-quorum.yml',
  ))

  const tesseraDefinitions = hasTessera ? readFileToString(joinPath(
    libRootDir(),
    'lib/docker-compose-definitions-tessera.yml',
  )) : ''

  const cakeshopDefinitions = hasCakeshop ? readFileToString(joinPath(
    libRootDir(),
    'lib/docker-compose-definitions-cakeshop.yml',
  )) : ''

  const splunkDefinitions = hasSplunk ? readFileToString(joinPath(
    libRootDir(),
    'lib/docker-compose-definitions-splunk-helpers.yml'
  )) : ''

  let services = config.nodes.map((node, i) => {
    let allServices = buildNodeService(config, node, i, hasTessera, hasSplunk)
    if (hasTessera) {
      allServices = [allServices, buildTesseraService(config, node, i, hasSplunk)].join('')
    }
    return allServices
  })
  if (hasCakeshop) {
    services = [services.join(''), buildCakeshopService(config, hasSplunk)]
  }
  if (hasSplunk) {
    services = [services.join(''),
      buildEthloggerService(config),
      buildCadvisorService(config)]
  }

  return [
    formatNewLine(quorumDefinitions),
    formatNewLine(tesseraDefinitions),
    formatNewLine(cakeshopDefinitions),
    formatNewLine(splunkDefinitions),
    'services:',
    services.join(''),
    buildEndService(config),
  ].join('')
}

export function buildSplunkDockerCompose(config) {
  let version = `version: "3.6"
`
  let services = [buildSplunkService(config)]
  info('Splunk>')

  return [
    version,
    'services:',
    services.join(''),
    buildSplunkEndService(config),
  ].join('')
}

export async function initDockerCompose(config) {
  info('Building docker-compose file...')
  const splunkFile = buildSplunkDockerCompose(config)
  const file = buildDockerCompose(config)
  const hasSplunk = config.network.splunk
  const networkPath = getFullNetworkPath(config)
  const qdata = joinPath(networkPath, 'qdata')

  if (isCakeshop(config.network.cakeshop)) {
    buildCakeshopDir(config, qdata)
  }

  if (hasSplunk) {
    writeFile(joinPath(networkPath, 'docker-compose-splunk.yml'), splunkFile, false)
  }
  writeFile(joinPath(networkPath, 'docker-compose.yml'), file, false)
  writeFile(joinPath(networkPath, '.env'), createEnvFile(config, isTessera(config.network.transactionManager)), false)
  info('Done')
}

function createEnvFile(config, hasTessera) {
  let env = `QUORUM_CONSENSUS=${config.network.consensus}
QUORUM_DOCKER_IMAGE=quorumengineering/quorum:${config.network.quorumVersion}
QUORUM_P2P_PORT=${config.containerPorts.quorum.p2pPort}
QUORUM_RAFT_PORT=${config.containerPorts.quorum.raftPort}
QUORUM_RPC_PORT=${config.containerPorts.quorum.rpcPort}
QUORUM_WS_PORT=${config.containerPorts.quorum.wsPort}
DOCKER_IP=${buildDockerIp(config.containerPorts.dockerSubnet, '10')}`
  if (hasTessera) {
    env = env.concat(`
QUORUM_TX_MANAGER_DOCKER_IMAGE=quorumengineering/tessera:${config.network.transactionManager}
TESSERA_P2P_PORT=${config.containerPorts.tm.p2pPort}
TESSERA_3PARTY_PORT=${config.containerPorts.tm.thirdPartyPort}`)
  }
  if (isQuorum260Plus(config.network.quorumVersion)) {
    env = env.concat(`
QUORUM_GETH_ARGS=--allow-insecure-unlock --graphql --graphql.port ${config.containerPorts.quorum.graphQlPort} --graphql.corsdomain=* --graphql.addr=0.0.0.0`)
  }
  if (getDockerRegistry() !== '') {
    env = env.concat(`
DOCKER_REGISTRY=${getDockerRegistry()}`)
  }
  return env
}

function buildNodeService(config, node, i, hasTessera, hasSplunk) {
  const networkName = config.network.name
  const txManager = hasTessera
    ? `depends_on:
      - txmanager${i + 1}
    environment:
      - PRIVATE_CONFIG=/qdata/tm/tm.ipc`
    : `environment:
      - PRIVATE_CONFIG=ignore`
  const splunkLogging = hasSplunk
    ? `logging: *default-logging` : ``

  return `
  node${i + 1}:
    << : *quorum-def
    container_name: node${i + 1}
    hostname: node${i + 1}
    ports:
      - "${node.quorum.rpcPort}:${config.containerPorts.quorum.rpcPort}"
      - "${node.quorum.wsPort}:${config.containerPorts.quorum.wsPort}"
      - "${node.quorum.graphQlPort}:${config.containerPorts.quorum.graphQlPort}"
    volumes:
      - ${networkName}-vol${i + 1}:/qdata
      - ./qdata:/examples:ro
    ${txManager}
      - NODE_ID=${i + 1}
    networks:
      ${networkName}-net:
        ipv4_address: ${node.quorum.ip}
    ${splunkLogging}`
}

function buildTesseraService(config, node, i, hasSplunk) {
  const networkName = config.network.name
  const splunkLogging = hasSplunk
    ? `logging: *default-logging` : ``
  return `
  txmanager${i + 1}:
    << : *tx-manager-def
    container_name: txmanager${i + 1}
    hostname: txmanager${i + 1}
    ports:
      - "${node.tm.thirdPartyPort}:${config.containerPorts.tm.thirdPartyPort}"
    volumes:
      - ${networkName}-vol${i + 1}:/qdata
      - ./qdata:/examples:ro
    networks:
      ${networkName}-net:
        ipv4_address: ${node.tm.ip}
    environment:
      - NODE_ID=${i + 1}
    ${splunkLogging}`
}

function buildCakeshopService(config, hasSplunk) {
  const splunkLogging = hasSplunk
    ? `logging: *default-logging` : ``
  const networkName = config.network.name
  return `
  cakeshop:
    << : *cakeshop-def
    container_name: cakeshop
    hostname: cakeshop
    ports:
      - "${config.network.cakeshopPort}:8999"
    volumes:
      - ${networkName}-cakeshopvol:/qdata
      - ./qdata:/examples:ro
    networks:
      ${networkName}-net:
        ipv4_address: ${cidrhost(config.containerPorts.dockerSubnet, 75)}
    ${splunkLogging}`
}

function buildSplunkService(config) {
  const networkName = config.network.name
  return `
  splunk:
    image: splunk/splunk:8.0.4-debian
    container_name: splunk
    hostname: splunk
    environment:
      - SPLUNK_START_ARGS=--accept-license
      - SPLUNK_HEC_TOKEN=11111111-1111-1111-1111-1111111111113
      - SPLUNK_PASSWORD=changeme
      - SPLUNK_APPS_URL=https://github.com/splunk/ethereum-basics/releases/download/latest/ethereum-basics.tgz,https://splunk-quorum.s3.us-east-2.amazonaws.com/oss-quorum-app-for-splunk_109.tgz
    expose:
      - "8000"
      - "8088"
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8000']
      interval: 5s
      timeout: 5s
      retries: 20
    ports:
      - "${config.network.splunkPort}:8000"
      - "8088:8088"
      - "8125:8125"
    volumes:
      - splunk-var:/opt/splunk/var
      - splunk-etc:/opt/splunk/etc
      - ./out/config/splunk/splunk-config.yml:/tmp/defaults/default.yml
    networks:
      ${networkName}-net:
        ipv4_address: ${config.network.splunkIp}`
}

function buildCadvisorService(config) {
  const networkName = config.network.name
  return `
  cadvisor:
    image: google/cadvisor:latest
    container_name: cadvisor
    hostname: cadvisor
    command:
      - --storage_driver=statsd
      - --storage_driver_host=${config.network.splunkIp}:8125
      - --docker_only=true
    user: root
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    networks:
      - ${networkName}-net
    logging: *default-logging`
}

function buildEthloggerService(config) {
  const networkName = config.network.name
  let ethloggers = ''

  config.nodes.forEach((node, i) => {
    const instance = i+1
    ethloggers += `
  ethlogger${instance}:
    image: splunkdlt/ethlogger:latest
    container_name: ethlogger${instance}
    hostname: ethlogger${instance}
    environment:
      - ETH_RPC_URL=http://node${instance}:${config.containerPorts.quorum.rpcPort}
      - NETWORK_NAME=quorum
      - START_AT_BLOCK=genesis
      - SPLUNK_HEC_URL=https://${config.network.splunkIp}:8088
      - SPLUNK_HEC_TOKEN=11111111-1111-1111-1111-1111111111113
      - SPLUNK_EVENTS_INDEX=ethereum
      - SPLUNK_METRICS_INDEX=metrics
      - SPLUNK_INTERNAL_INDEX=metrics
      - SPLUNK_HEC_REJECT_INVALID_CERTS=false
      - COLLECT_PEER_INFO=true
    depends_on:
      - node${instance}
    restart: unless-stopped
    volumes:
      - ethlogger-state${instance}:/app
    networks:
      - ${networkName}-net
    logging: *default-logging`
  })
  return ethloggers
}

function buildEndService(config) {
  const networkName = config.network.name
  const volumes = []
  config.nodes.forEach((_node, i) => {
    const nodeNumber = i + 1
    volumes.push(`  "${networkName}-vol${nodeNumber}":`)
    if (config.network.splunk) {
      volumes.push(`  "ethlogger-state${nodeNumber}":`)
    }
  })
  if (isCakeshop(config.network.cakeshop)) {
    volumes.push(`  "${networkName}-cakeshopvol":`)
  }
  return `
networks:
  ${networkName}-net:
    name: ${networkName}-net
    driver: bridge
    ipam:
      driver: default
      config:
        - subnet: ${config.containerPorts.dockerSubnet}
volumes:
${volumes.join('\n')}`
}

function buildSplunkEndService(config) {
  const networkName = config.network.name
  return `
networks:
  ${networkName}-net:
    name: ${networkName}-net
    driver: bridge
    ipam:
      driver: default
      config:
        - subnet: ${config.containerPorts.dockerSubnet}
volumes:
  "splunk-var":
  "splunk-etc":`
}
