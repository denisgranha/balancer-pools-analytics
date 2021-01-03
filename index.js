const axios = require('axios').default;
const moment = require('moment')

const API_URL = "https://api.thegraph.com/subgraphs/name/balancer-labs/balancer"

/**
 * Get all Balancer Shared pools
 */
async function getPools(){

  const poolResponse = await axios({
    url: API_URL,
    method: 'post',
    data: {
      query: `
        {
          pools(
            first: 1000, 
            where: {
              
              publicSwap: true
              liquidity_gt: 1000
              totalSwapFee_gt: 1000
              swapsCount_gt: 0
            }
          ){
            id
            swapFee
            liquidity
            swapsCount
            totalWeight
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

  return poolResponse.data.data.pools
}

async function getSwapsFromPool(id, swapCount){  

  let swaps = []

  const oneMonthAgo = moment().subtract(1, 'months').unix()

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

  console.log(`There are ${pools.length} pools on Balancer with more than 1k USD of liquidity`)

  const formattedPools = pools.map(pool => {
    pool.swapFee = `${pool.swapFee*100}%`

    
    // Iterate token list
    let weightFactor = 100/pool.totalWeight
    pool.weights = ''
    for(let j=0; j<pool.tokens.length; j++){
    pool.weights += `${pool.tokens[j].denormWeight*weightFactor}% ${pool.tokens[j].symbol} | `
    }
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

    // @TODO make parallel requests
    const swaps = await getSwapsFromPool(formattedPools[i].id, formattedPools[i].swapsCount)

    // console.log(`There are ${swaps.length} swaps on pool ${formattedPools[i].id} performed last month`)

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
