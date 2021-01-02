const axios = require('axios').default;
const moment = require('moment')

const API_URL = "https://api.thegraph.com/subgraphs/name/balancer-labs/balancer"

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
const DAI = "0x6b175474e89094c44da98b954eedeac495271d0f"

/**
 * Get all Balancer Shared pools of WETH and DAI (exclusively)
 */
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
              liquidity_gt: 1000
            }
          ){
            id
            swapFee
            liquidity
            swapsCount
            createTime
            tokens {
              symbol
              denormWeight
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
              liquidity_gt: 1000
            }
          ){
            id
            swapFee
            liquidity
            swapsCount
            createTime
            tokens {
              symbol
              denormWeight
            }
          }
        }   
        `
    }
  })
  return poolResponsePair1.data.data.pools.concat(poolResponsePair2.data.data.pools)
}

async function getSwapsFromPool(id, swapCount){  

  let swaps = []

  const oneMonthAgo = moment().subtract(1, 'months').unix()

  // let timestamp = oneMonthAgo

  // Max swaps returned by request are 1000. We need to do swapCount/100 requests to get all
  for(let page = 0; page < swapCount/1000; page++){
    const swapsResponse = await axios({
      url: API_URL,
      method: 'post',
      data: {
        query: `
                {
                  pools(first: 1, where: {id: "${id}"}) {
                    swaps(where :{timestamp_gte: ${oneMonthAgo} }, orderBy: timestamp, first: 1000, skip: ${1000*page}) {
                      id
                      tokenInSym
                      tokenOutSym
                      tokenAmountOut
                      timestamp
                      poolLiquidity
                      feeValue
                    }
                  }
                }
                `
              }
    })

    if(!swapsResponse.data.data){
      console.error(JSON.stringify(swapsResponse.data.errors, null, 4))
    }
    else{
      // We assume it's always responding one pool
      let newSwaps = swapsResponse.data.data.pools[0].swaps
      swaps = swaps.concat(newSwaps)
    }
  }

  return swaps
  
  
  
}

/**
 * 
 */

async function run(){
  const pools = await getPools()

  console.log(`There are ${pools.length} pools on Balancer of WETH - DAI with more than 1k USD of liquidity`)

  const formattedPools = pools.map(pool => {
    pool.swapFee = `${pool.swapFee*100}%`
    let totalWeight = parseInt(pool.tokens[0].denormWeight) + parseInt(pool.tokens[1].denormWeight)
    let weightFactor = 100/totalWeight
    pool.weights = `${pool.tokens[0].denormWeight*weightFactor}% ${pool.tokens[0].symbol} | ${pool.tokens[1].denormWeight*weightFactor}% ${pool.tokens[1].symbol}`
    pool.liquidity = parseInt(pool.liquidity)
    pool.createTime = moment(pool.createTime*1000).fromNow()
    delete pool.tokens
    return pool
  })

  formattedPools.sort(function(a, b) {
    var keyA = a.liquidity,
      keyB = b.liquidity;
    // Compare the 2 dates
    if (keyA > keyB) return -1;
    if (keyA < keyB) return 1;
    return 0;
  });

  // Iterate all pools and calculate APY's
  for(let i=0; i<formattedPools.length; i++){
    // To calculate APY, we can sum up swapfee/totalLiquidity for every swap over a period of time
    // And extrapolate it to a 1 year period considering it's a compound interest behaviour because the fees 
    // are deposited into the pool on every trade
    const swaps = await getSwapsFromPool(formattedPools[i].id, formattedPools[i].swapsCount)

    console.log(`There are ${swaps.length} swaps on pool ${formattedPools[0].id} performed last month`)

    const reducer = (accumulator, currentValue) => {
      accumulator.totalFeesUSD += parseFloat(currentValue.feeValue)

      // @TODO this is not the real interest, it's a bit bigger because fees are being deposited all the time
      // thus making it a compound interest
      accumulator.monthlyInterest += (parseFloat(currentValue.feeValue)/parseFloat(currentValue.poolLiquidity))*100

      return accumulator
    }

    const extraInfo = swaps.reduce(reducer, {totalFeesUSD: 0, monthlyInterest: 0})
    // console.log(extraInfo)
    Object.assign(formattedPools[i], extraInfo)
  }

  console.table(formattedPools)
}

run()