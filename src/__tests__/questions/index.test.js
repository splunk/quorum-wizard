import { createQuickstartConfig, createCustomConfig } from '../../model/NetworkConfig'
import { customize, quickstart } from '../../questions'
import { buildBash } from '../../utils/bashHelper'
import { prompt } from 'inquirer'
import { getPorts } from '../../utils/promptHelper'

jest.mock('inquirer')
jest.mock('../../model/NetworkConfig')
jest.mock('../../utils/bashHelper')
jest.mock('../../utils/dockerHelper')
jest.mock('../../utils/promptHelper')

const QUICKSTART_CONFIG = {
  numberNodes: '5',
  consensus: 'istanbul',
  gethBinary: '2.4.0',
  transactionManager: '0.10.2',
  deployment: 'bash',
  cakeshop: false
}

const CUSTOM_CONFIG = {
  numberNodes: '5',
  consensus: 'raft',
  transactionManager: 'none',
  deployment: 'docker-compose',
  cakeshop: false,
  keyGeneration: false,
  networkId: 10,
  genesisLocation: 'testDir',
  defaultPorts: false,
  nodes: ['nodes']
}

test('placeholder', async () => {
  const fakeConfig = { test: 'test' }
  prompt.mockResolvedValue(QUICKSTART_CONFIG)
  createQuickstartConfig.mockReturnValue(fakeConfig)
  await quickstart()
  expect(createQuickstartConfig)
  .toHaveBeenCalledWith(QUICKSTART_CONFIG)
  expect(buildBash).toHaveBeenCalledWith(fakeConfig)
})

test('customize', async () => {
  const fakeConfig = { test: 'test' }
  const fakeCommands = {tesseraStart: 'test', gethStart: 'test', initStart: ['test'],netPath: 'test',}
  createCustomConfig.mockReturnValue(fakeConfig)
  prompt.mockResolvedValueOnce(QUICKSTART_CONFIG)
  prompt.mockResolvedValueOnce(CUSTOM_CONFIG)
  getPorts.mockReturnValueOnce(['nodes'])
  await customize()
  let combinedAnswers = {
    ...QUICKSTART_CONFIG,
    ...CUSTOM_CONFIG,
    nodes: ['nodes'],
  }
  expect(createCustomConfig).toHaveBeenCalledWith(combinedAnswers)

  expect(buildBash).toHaveBeenCalledWith(fakeConfig)
})
