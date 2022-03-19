const nodemailer = require('nodemailer');

const carriers = require('./carriers.js');
const providers = require('./providers.js');

let config = require('./config.js');

//----------------------------------------------------------------
/*
    General purpose logging function, gated by a configurable
    value.
*/
function output(...args) {
  if (config.debugEnabled) {
    // eslint-disable-next-line no-console
    console.log.apply(this, args);
  }
}

//----------------------------------------------------------------
/*  Overrides default config

    Takes a new configuration object, which is
    used to override the defaults

    Params:
      obj - object of config properties to be overridden
*/
function setConfig(obj) {
  config = Object.assign(config, obj);
}

//----------------------------------------------------------------
/*  Sends a text message

    Will perform a region lookup (for providers), then
    send a message to each.

    Params:
      phone - phone number to text
      message - message to send
      carrier - carrier to use (may be null)
      region - region to use (defaults to US)
      cb - function(err, info), NodeMailer callback
*/
function sendText(phone, message, carrier, region, cb) {
  let providersList;
  if (carrier) {
    providersList = carriers[carrier];
  } else {
    providersList = providers[region || 'us'];
  }

  let transporter;
  if (config.transport.pool) {
    // use the pooled transporter
    if (!config.transporter) {
      setConfig({
        transporter: nodemailer.createTransport(config.transport),
      });
    }
    transporter = config.transporter; // eslint-disable-line
  } else {
    transporter = nodemailer.createTransport(config.transport);
  }

  output('sending message', JSON.stringify({
    phone,
    carrier,
    region,
    size: message.length,
    pool: !!config.transporter,
  }));

  const p = Promise.all(providersList.map((provider) => {
    const to = provider.replace('%s', phone);

    const mailOptions = {
      to,
      subject: null,
      text: message,
      html: message,
      ...config.mailOptions,
    };

    return new Promise((resolve, reject) => transporter.sendMail(mailOptions, (err, info) => {
      if (err) return reject(err);
      return resolve(info);
    }));
  })).finally(() => {
    // close transport if not pooling
    if (!config.transporter) {
      transporter.close();
    }
  });

  // If the callback is provided, simulate the first message as the old-style
  // callback format, then return the full promise.
  if (cb) {
    return p.then((info) => {
      cb(null, info[0]);
      return info;
    }, (err) => {
      cb(err);
      return err;
    });
  }

  return p;
}

module.exports = {
  send: sendText, // Send a text message
  config: setConfig, // Override default config
};
