const axios = require('axios').default;

const API_URL = "https://api.thegraph.com/subgraphs/name/balancer-labs/balancer"

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
const DAI = "0x6b175474e89094c44da98b954eedeac495271d0f"

async function getPools(){

  // We need to do two requests and merge them because I haven't found a way to query pools
  // that only contains two specific tokens.
  // The graph returns a different response based on the token list order. For two tokens that's fine
  // for more... that grows factorial
  const poolResponsePair1 = await axios({
    url: API_URL,
    method: 'post',
    data: {
      query: `
        {
          pools(
            first: 1000, 
            where: {
              tokensList: ["${WETH}", "${DAI}"],
              publicSwap: true
            }
          ){
            id
            publicSwap
            finalized
            swapFee
            totalWeight
            totalShares
            tokensList
            tokens {
              id
              address
              balance
              decimals
              symbol
              denormWeight
            }
            shares {
              id
              poolId {
                id
              }
              userAddress {
                id
              }
              balance
            }
          }
        }   
        `
    }
  })

  const poolResponsePair2 = await axios({
    url: API_URL,
    method: 'post',
    data: {
      query: `
        {
          pools(
            first: 1000, 
            where: {
              tokensList: ["${DAI}", "${WETH}"],
              publicSwap: true
            }
          ){
            id
            publicSwap
            finalized
            swapFee
            totalWeight
            totalShares
            tokensList
            tokens {
              id
              address
              balance
              decimals
              symbol
              denormWeight
            }
            shares {
              id
              poolId {
                id
              }
              userAddress {
                id
              }
              balance
            }
          }
        }   
        `
    }
  })

  return poolResponsePair1.data.data.pools.concat(poolResponsePair2.data.data.pools)
}

async function run(){
  const pools = await getPools()

  console.log(`There are ${pools.length} pools on Balancer`)
}

run()