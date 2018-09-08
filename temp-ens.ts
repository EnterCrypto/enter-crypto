/**
Imports wont work, needs to be tailored to the project
**/

import {
  DEFAULT_GAS_LIMIT,
  ENS_REGISTRY_ADDRESS,
  ENS_RESOLVER_ADDRESS,
  ZINC_ETH_ADDRESS
} from "../config/web3.config"
import logger from "../logger"
import { ensRegistry, ensResolver, getGasPrice, web3 } from "./web3-constructor"
import { signTx } from "./web3-write"

/* tslint:disable-next-line:no-var-requires */
const namehash = require("eth-ens-namehash")
/* tslint:disable-next-line:no-var-requires */
const stringPrep = require("node-stringprep").StringPrep
const prep = new stringPrep("nameprep")

export function nameprep(v: string): string {
  return prep.prepare(v)
}

const setSubnodeOwnerTx = (
  sub: string,
  domain: string,
  ownerAdress: string
) => (transactionNonce: number) => {
  const node = namehash.hash(domain)
  const label = web3.utils.sha3(sub)
  const txData = {
    nonce: web3.utils.toHex(transactionNonce),
    gasLimit: web3.utils.toHex(DEFAULT_GAS_LIMIT),
    gasPrice: web3.utils.toHex(getGasPrice()),
    to: ENS_REGISTRY_ADDRESS,
    from: ZINC_ETH_ADDRESS,
    data: ensRegistry.methods
      .setSubnodeOwner(node, label, ownerAdress)
      .encodeABI()
  }
  return signTx(txData)
}

const setResolverTx = (sub: string, domain: string) => (
  transactionNonce: number
) => {
  const txData = {
    nonce: web3.utils.toHex(transactionNonce),
    gasLimit: web3.utils.toHex(DEFAULT_GAS_LIMIT),
    gasPrice: web3.utils.toHex(getGasPrice()),
    to: ENS_REGISTRY_ADDRESS,
    from: ZINC_ETH_ADDRESS,
    data: ensRegistry.methods
      .setResolver(namehash.hash(`${sub}.${domain}`), ENS_RESOLVER_ADDRESS)
      .encodeABI()
  }
  return signTx(txData)
}

const setAddrTx = (sub: string, domain: string, address: string) => (
  transactionNonce: number
) => {
  const txData = {
    nonce: web3.utils.toHex(transactionNonce),
    gasLimit: web3.utils.toHex(DEFAULT_GAS_LIMIT),
    gasPrice: web3.utils.toHex(getGasPrice()),
    to: ENS_RESOLVER_ADDRESS,
    from: ZINC_ETH_ADDRESS,
    data: ensResolver.methods
      .setAddr(namehash.hash(`${sub}.${domain}`), address)
      .encodeABI()
  }
  return signTx(txData)
}

export async function setEnsSubdomain(
  sub: string,
  domain: string,
  address: string,
  ownerAddress: string
) {
  try {
    const prepSub = nameprep(sub)
    const prepDomain = nameprep(domain)
    const setSubnodeOwner = setSubnodeOwnerTx(
      prepSub,
      prepDomain,
      ZINC_ETH_ADDRESS
    )
    const setResolver = setResolverTx(prepSub, prepDomain)
    const setAddr = setAddrTx(prepSub, prepDomain, address)
    const setSubnodeOwnerToUser = setSubnodeOwnerTx(
      prepSub,
      prepDomain,
      ownerAddress
    )

    for (const txCreator of [
      setSubnodeOwner,
      setResolver,
      setAddr,
      setSubnodeOwnerToUser
    ]) {
      const txCount = await web3.eth.getTransactionCount(
        ZINC_ETH_ADDRESS,
        "pending"
      )
      const tx = txCreator(txCount)
      const txReceipt = await web3.eth.sendSignedTransaction(tx)
      if (!txReceipt.status || !txReceipt.transactionHash) {
        logger.errorSOS(`TX failed: ${JSON.stringify(txReceipt)}`)
        throw new Error(`set ENS subdomain failed`)
      }
    }
    logger.info(`ENS name: ${sub} set to ${address}`)
  } catch (e) {
    throw new Error(`set ENS subdomain failed. See error: ${e}`)
  }
}

export async function resolveEnsName(sub: string, domain: string) {
  const node = namehash.hash(`${nameprep(sub)}.${nameprep(domain)}`)
  return ensResolver.methods.addr(node).call({})
}

export async function checkIfEnsNameIsAvailable(sub: string, domain: string) {
  const resolved = await resolveEnsName(nameprep(sub), nameprep(domain))
  return {
    address: resolved,
    available: resolved === "0x0000000000000000000000000000000000000000"
  }
}
