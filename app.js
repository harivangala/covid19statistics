const express = require('express')
const path = require('path')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')
let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

//Authentication with Token (Middleware)
const tokenAuthentication = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

const convertDbObjectToResponseObject = eachStateObj => {
  return {
    stateId: eachStateObj.state_id,
    stateName: eachStateObj.state_name,
    population: eachStateObj.population,
  }
}

//1.User login API
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//2.Get all states API
app.get('/states/', tokenAuthentication, async (request, response) => {
  const getAllStatesArrayQuery = `SELECT * FROM state;`
  const statesArray = await db.all(getAllStatesArrayQuery)
  const statesResponseObjectArray = statesArray.map(eachObj => {
    return convertDbObjectToResponseObject(eachObj)
  })
  response.send(statesResponseObjectArray)
})

//3.Get a state API
app.get('/states/:stateId/', tokenAuthentication, async (request, response) => {
  const {stateId} = request.params
  const getAStateQuery = `SELECT * FROM state
    WHERE state_id = ${stateId};`
  const state = await db.get(getAStateQuery)
  response.send({
    stateId: state.state_id,
    stateName: state.state_name,
    population: state.population,
  })
})

//4.Add a district in district table API
app.post('/districts/', tokenAuthentication, async (request, response) => {
  const districtDetails = request.body
  // console.log(districtDetails)
  const {districtName, stateId, cases, cured, active, deaths} = districtDetails
  const addDistrictQuery = `
    INSERT INTO
    district(district_name, state_id, cases, cured, active, deaths)
    VALUES("${districtName}", ${stateId}, ${cases}, ${cured}, ${active}, ${deaths});`
  await db.run(addDistrictQuery)
  response.send('District Successfully Added')
})

//5.Get a district API
app.get(
  '/districts/:districtId/',
  tokenAuthentication,
  async (request, response) => {
    const {districtId} = request.params
    const getADistrictQuery = `
    SELECT *
    FROM district
    WHERE district_id = ${districtId};`
    const district = await db.get(getADistrictQuery)
    response.send({
      districtId: district.district_id,
      districtName: district.district_name,
      stateId: district.state_id,
      cases: district.cases,
      cured: district.cured,
      active: district.active,
      deaths: district.deaths,
    })
  },
)

//6.Remove a district API
app.delete(
  '/districts/:districtId/',
  tokenAuthentication,
  async (request, response) => {
    const {districtId} = request.params
    const removeDistrictQuery = `DELETE FROM district
    WHERE district_id = ${districtId};`
    await db.run(removeDistrictQuery)
    response.send('District Removed')
  },
)

//7.Update a district API
app.put(
  '/districts/:districtId/',
  tokenAuthentication,
  async (request, response) => {
    const {districtId} = request.params
    const districtDetails = request.body
    const {districtName, stateId, cases, cured, active, deaths} =
      districtDetails
    const updateDistrictQuery = `
    UPDATE district
    SET
      district_name = '${districtName}',
      state_id = ${stateId},
      cases = ${cases},
      cured = ${cured},
      active = ${active},
      deaths = ${deaths}
    WHERE district_id = ${districtId};`
    await db.run(updateDistrictQuery)
    response.send('District Details Updated')
  },
)

//8.Get statistics of covid of a state API
app.get(
  '/states/:stateId/stats/',
  tokenAuthentication,
  async (request, response) => {
    const {stateId} = request.params
    const getTheStatsOfAStateQuery = `
    SELECT 
      SUM(cases) as totalCases,
      SUM(cured) as totalCured,
      SUM(active) as totalActive,
      SUM(deaths) as totalDeaths
    FROM district
    WHERE state_id = ${stateId};`
    const statesOfState = await db.get(getTheStatsOfAStateQuery)
    response.send({
      totalCases: statesOfState.totalCases,
      totalCured: statesOfState.totalCured,
      totalActive: statesOfState.totalActive,
      totalDeaths: statesOfState.totalDeaths,
    })
  },
)

//9.Get stateName based on districtId API
app.get(
  '/districts/:districtId/details/',
  tokenAuthentication,
  async (request, response) => {
    const {districtId} = request.params
    const getStatenameByDistrictIdQuery = `
    SELECT state.state_name
    FROM
      state join district
      ON state.state_id = district.state_id
    WHERE district.district_id = ${districtId};
  `
    const stateNameObj = await db.get(getStatenameByDistrictIdQuery)
    response.send({stateName: stateNameObj.state_name})
  },
)

module.exports = app
