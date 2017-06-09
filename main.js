'use strict'

process.chdir(__dirname)

var express = require('express')
var app = express()
var server = require('http').Server(app)
var LocalStorage = require('node-localstorage').LocalStorage
var localStorage = new LocalStorage('./scratch')
var moment = require('moment')
var Forecast = require('forecast.io-bluebird')
var os = require('os')
var path = require('path')
var cfg = require('./config')
if (os.hostname() == cfg.hostname) {
  var gpio = require('rpi-gpio')
}

var Logger = require('./logger')

var weatherData
var present = true
var monitorStatus
var lastPresentTime = Date.now()
var presentSince = Date.now()

function init() {

  Logger.log('=============================================', 100)
  Logger.log(`STARTING UP...`, 100)
  Logger.log(`Version: ${cfg.version}`, 100)
  Logger.log(`Time: ${moment().format('MM/DD/YY h:mm:ssa')}`, 100)
  Logger.log(`Port: ${cfg.port}`, 100)
  Logger.log('=============================================', 100)

  // Get information from sensors
  if (gpio) {

    gpio.setup(cfg.gpioPin.pir, gpio.DIR_IN, gpio.EDGE_BOTH)
    gpio.setup(cfg.gpioPin.button, gpio.DIR_IN, gpio.EDGE_BOTH)
    gpio.setup(cfg.gpioPin.led1, gpio.DIR_HIGH)
    gpio.setup(cfg.gpioPin.led2, gpio.DIR_LOW)
    gpio.setup(cfg.gpioPin.monitorPower, gpio.DIR_LOW)
    gpio.setup(cfg.gpioPin.monitorMode, gpio.DIR_LOW)
    gpio.setup(cfg.gpioPin.monitorStatus, gpio.DIR_IN, gpio.EDGE_BOTH, function() {
      gpio.read(cfg.gpioPin.monitorStatus, function(err, value) {
        monitorStatus = value
        Logger.log(`Monitor (GPIO ${cfg.gpioPin.monitorStatus}) is ON: ${value}`, 100)
        turnMonitor('ON')
        Logger.log('=============================================', 100)
      })
    })

    // Monitor changes in the GPIO pins
    gpio.on('change', function(channel, value) {
      Logger.log('Channel ' + channel + ' value is now ' + value)
      // PIR sensor
      if (channel == cfg.gpioPin.pir) {
        if (value) {
          Logger.log('+++ PIR ACTIVATED')
          setPresent()
        }
      // Monitor state (screen ON/OFF)
      } else if (channel == cfg.gpioPin.monitorStatus) {
        monitorStatus = value
        // if (value) {
        //   Logger.log('+++ SCREEN IS ON')
        // } else {
        //   Logger.log('+++ SCREEN IS OFF')
        // }
      }
    })
  }

  // Status information (only for log)
  setInterval(getStatus, cfg.printStatusInterval)

  // check every second for new events
  setInterval(checkTime, 1000)

  // Web stuff
  app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'))
  app.use(express.static(path.join(__dirname, 'public')));
  
  var router = express.Router()
  router.route('/weather')
  .get(function(req, res) {
    //res.json({ appearalDegrees: cfg.appearalDegrees, dayMilestones: dayMilestones, weather: weatherData })
    res.json({ appearalDegrees: cfg.appearalDegrees, weather: weatherData })
  })
  router.route('/status')
  .get(function(req, res) {
    res.json({ status: getStatus() })
  })
  router.route('/present')
  .get(function(req, res) {
    setPresent()
    present = true
    res.json({ present: present })
  })
  app.use('/api', router)
  app.listen(cfg.port)

  // load internet information
  getForecast()
  setInterval(()=>{getForecast(true)}, cfg.forecast.checkInterval)

}

// Send HIGH to an OUT pin for 0.1 secs
function emulatePushButton(pinNumber) {
  gpio.write(pinNumber, true, function() {
    setTimeout(function() {
      gpio.write(pinNumber, false)
    }, 100)
  })
}

// Try to turn on or off the monitor
function turnMonitor(on_off) {
  //Logger.log(`FUN_CALL: turnMonitor(${on_off})`, 0)
  if (monitorStatus === false && on_off == 'ON') {
    Logger.log('        : monitor was OFF, let us try to turn it ON...', 0)
    emulatePushButton(cfg.gpioPin.monitorPower)
  } else if (monitorStatus === true && on_off == 'OFF') {
    Logger.log('        : monitor was ON, let us try to turn it OFF...', 0)
    emulatePushButton(cfg.gpioPin.monitorPower)
  } else {
    Logger.log('        : monitor was already as it was supposed to be :D', 0)
  }
}

function getStatus() {
  var statusString = [];
  statusString.push('present: ' + present)
  statusString.push('elapsed since presence: ' + moment.duration(Date.now()-presentSince).asMinutes().toFixed(2))
  statusString.push('elapsed since last activity: ' + moment.duration(Date.now()-lastPresentTime).asMinutes().toFixed(2))
  statusString.push('monitorStatus: ' + monitorStatus)
  statusString = 'STATUS: ' + statusString.join(' | ')
  Logger.log(statusString)
  return statusString
}

function getForecast(force) {
  if (!localStorage.getItem("weatherData") || force) {
    var forecast = new Forecast({
      key: cfg.forecast.apiKey,
      timeout: 2500
    })
    forecast.fetch(cfg.forecast.lat, cfg.forecast.long)
    .then(function(data) {
      weatherData = data
      localStorage.setItem("weatherData", JSON.stringify(weatherData))
      Logger.log('Forecast.io: Got weather data from internet.')
      checkForPrecipitation()
    })
    .catch(function(error) {
      Logger.log("Forecast.io Error: " + error)
    })
  } else {
    weatherData = JSON.parse(localStorage.getItem("weatherData"))
    Logger.log('Forecast.io: Got weather data from localstorage.')
  }
  checkForPrecipitation()
}

function checkForPrecipitation() {
  // console.log(weatherData.minutely.data)

  // var totalaccumulation = 0;

  // for (var i = 0; i < weatherData.hourly.data.length; i++) {
  //   var node = weatherData.hourly.data[i]
  //   totalaccumulation+= node.precipAccumulation
  //   console.log(moment(node.time*1000).format('h:mma') + " " + node.summary + ", total: " +  totalaccumulation)
  //   //console.log(node.summary, moment(node.time*1000).format('h:mma'))
  //   //console.log(node.precipProbability, node.precipType, moment(node.time*1000).format('h:mma'))
  // }
}

function checkTime() {
  var inactivityTime = Date.now() - lastPresentTime
  if (present) {
    if (inactivityTime > cfg.presenceTimeout) {
      Logger.log(`---> It has been more than ${cfg.presenceTimeout} since activity was monitored:`, 100)
      Logger.log(`     Going to set status to ABSENT`, 100)
      setAbsent(function() {
        Logger.log(' LED ON ')
      })
    }
    // Just try to turn on the monitor if it's off.
    // This shouldn't really be necessary
    //turnMonitor('ON')
  } else {
    // Just try to turn off the monitor if it's on.
    // This shouldn't really be necessary
    //turnMonitor('OFF')
  }
}

function getApperel(degrees) {
  if (degrees > cfg.appearalDegrees.hoodie) {
    return "t-shirt"
  } else if (degrees <= cfg.appearalDegrees.hoodie && degrees > cfg.appearalDegrees.jacket) {
    return "hoodie"
  } else if (degrees <= cfg.appearalDegrees.jacket && degrees > cfg.appearalDegrees.heavyJacket) {
    return "jacket"
  } else if (degrees <= cfg.appearalDegrees.heavyJacket && degrees > cfg.appearalDegrees.fullWinter) {
    return "heavy jacket"
  } else if (degrees <= cfg.appearalDegrees.fullWinter) {
    return "heavy jacket with a hat and gloves"
  }
}

function setPresent() {
  //Logger.log("FUN_CALL: setPresent()", 0)
  if (present === false) {
    presentSince = Date.now()
    gpio.write(cfg.gpioPin.led1, true)
  }
  present = true
  lastPresentTime = Date.now()
  // Try to turn on the monitor
  turnMonitor('ON')
}

function setAbsent(callback) {
  //Logger.log("FUN_CALL: setAbsent()", 0)
  present = false
  // Try to turn off the monitor
  turnMonitor('OFF')
  gpio.write(cfg.gpioPin.led1, false)
}

init()

