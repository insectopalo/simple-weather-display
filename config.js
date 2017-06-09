const config = {
  version: '0.0.1',
  forecast: { // Get a Forecast.io account: https://developer.forecast.io/ (Best weather api)
    apiKey: 'c6c120cfe728346db85f19572e027440',
    lat: '60.368429', // Look up your lat long: http://www.latlong.net/
    long: '5.361564',
    checkInterval: 5*60*1000, // 5 minutes
  },
  appearalDegrees: {
    hoodie: 64, // Anything belore this number (in F) is that.
    jacket: 55, 
    heavyJacket: 45, 
    fullWinter: 30
  },
  hostname: 'weatherpi', // If your Raspberry Pi hostname is something else, change it.
  port: process.env.PORT || 3000,
  logLevel: 0,
  printStatusInterval: 5*1000, // Print status information every 5 seconds
  presenceTimeout: 5*60*1000, // Turn off monitor after 5 minutes of inactivity
  gpioPin: {
    pir: 11,
    monitorPower: 13,
    monitorMode: 15,
    monitorStatus: 16,
    led1: 36,
    led2: 37,
    button: 22
  }
}

module.exports = config
