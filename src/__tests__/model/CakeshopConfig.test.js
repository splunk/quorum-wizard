import { createQuickstartConfig } from '../../model/NetworkConfig'
import { generateCakeshopConfig } from '../../model/CakeshopConfig'

test('creates 3nodes raft dockerFile tessera cakeshop', () => {
  const config = createQuickstartConfig({
    numberNodes: '3',
    consensus: 'raft',
    gethBinary: '2.4.0',
    transactionManager: '0.10.2',
    deployment: 'docker-compose',
    cakeshop: true
  })
  const cakeshop = generateCakeshopConfig(config)
  expect(cakeshop).toMatchSnapshot()
})

test('creates 3nodes istanbul bash tessera cakeshop', () => {
  const config = createQuickstartConfig({
    numberNodes: '3',
    consensus: 'istanbul',
    gethBinary: '2.4.0',
    transactionManager: '0.10.2',
    deployment: 'bash',
    cakeshop: true
  })
  const cakeshop = generateCakeshopConfig(config)
  expect(cakeshop).toMatchSnapshot()
})

test('creates 3nodes raft dockerFile no tessera cakeshop', () => {
  const config = createQuickstartConfig({
    numberNodes: '3',
    consensus: 'raft',
    gethBinary: '2.4.0',
    transactionManager: 'none',
    deployment: 'docker-compose',
    cakeshop: true
  })
  const cakeshop = generateCakeshopConfig(config)
  expect(cakeshop).toMatchSnapshot()
})

test('creates 3nodes istanbul bash no tessera cakeshop', () => {
  const config = createQuickstartConfig({
    numberNodes: '3',
    consensus: 'istanbul',
    gethBinary: '2.4.0',
    transactionManager: 'none',
    deployment: 'bash',
    cakeshop: true
  })
  const cakeshop = generateCakeshopConfig(config)
  expect(cakeshop).toMatchSnapshot()
})
