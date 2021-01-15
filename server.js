const chalk = require('chalk')
const express = require('express')
const cors = require('cors')
const morgan = require('morgan')

const edgeImpulseRoute = require('./edge-impulse/run-impulse')

const app = express()

app.use(cors())
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan('dev'))

app.get('/', (request, response) => {
    response.json({ info: 'Rest API to classify ir image' })
})

app.use(edgeImpulseRoute)

const port = process.env.PORT || 5001
app.listen(port, () => {
    console.log(chalk.blueBright(`\nApp running on port`) + chalk.yellowBright(` ${port}.`))
})

