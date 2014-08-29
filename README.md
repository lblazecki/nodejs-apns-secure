nodejs-apns-secure
==================

New reliable nodejs module for sending notifications via apns.
Main advantages :

* obtaining <b>quick delivery reports</b> after last notification sent
* a more <b>streamlined</b> sending process plus the ability to send <b>bulk messaging</b>
* sending robustness
* simplicity of use

Because of current modules that are slow and unreliable I needed to make a new one. After testing and putting this module in production I wanted to share it.

### Download

From github or from npm :
``` npm install nodejs-apns-secure ```

Using the module is very simple:

### 1) Create authObject with information for tls connection and options with information regarding APNS
See [options] in nodejs tls documentation for <b>authObject</b> : http://nodejs.org/api/tls.html#tls_tls_connect_port_host_options_callback

```
var certData = "-----BEGIN CERTIFICATE...END CERTIFICATE-----";
var keyData =  "-----BEGIN RSAPRIVATE KEY...END RSA PRIVATE KEY-----";  
var authObject = {
    cert : certData,
    key : keyData,
    passphrase : "passphrase"
};

or

var authObject = {
    pfx : readFromFile('file.p12')
    passphrase : "passphrase"
};

var options = {isProduction : true};

var sender = new (require('nodejs-apns-secure'))(authObject, options);
```
In <b>options</b> object isProduction should be set to true or false. Other values are not needed.

All fields for <b>options</b> : {

 isProduction : bool, set to true if your certificates are for production, otherwise set to false

 maxReconnectTry : number, how many times to try to reconnect,

 sendingTimeout : number in ms, how many time to wait for 1 connection to resolve itself,

 host : string, you can change host for connecting, do not set this,

 port : string, you can change port for connecting, do not set this,

}

### 2) Create notifications and tokens

```
var apnsMessage1 = {
         expiry : 0,
         _id : "1asd1231"
};
var apnsMessage2 = {
         expiry : 0,
         _id : "1asd1231"
};
apnsMessage1.payload = apnsMessage2.payload = {
         'aps': {"badge" : "123", "alert" : "Test it bulk", "sound" : "default"}
};
var tokens = ["32 length token", "32 length token"];
var apnsMessages = [apnsMessage1, apnsMessage1];
```

### 3) Send notifications and receive result status report

```
sender.send(apnsMessages, tokens)
    .then(function (resultStatusArray) {
        console.log(resultStatusArray);
    }).catch(function (error) {
        console.log(error);
        console.log(error.stack);
    });
);
```

Enter the tokens in the tokens array.
Messages for sending are a JSON array containing:

    * _id -> notification id
    * expiry -> set 0 to disable or UNIX epoch date expressed in seconds
    * payload -> data for sending

iOS phone will use these fields from payload:

    * aps.alert -> notification text; if not set the notification will not be shown
    * aps.sound -> prior to use, set to 'default'
    * aps.badge -> number

### Result status report

```
[ { token: '1.token',
    status: 0,
    _id: '1asd1231' },   
  { token: '2.token',
    status: 8,
    _id: '1asd1231' }]
```
The status report contains:

    * _id -> notification id
    * token
    * status -> 0 for success, 7 for too long payload, 8 for invalid token, 9 for invalid notification


### The magic

This module uses the apns error report for finding the last notification sent and thus confirming the reception of all prior notifications.

It also filters all notifications and tokens prior to sending, speeding up the sending processs.

### Feedback isn't working now

When having a large list of tokens that aren't filtered (with many invalid ones that will result in delay when sending),
feedback can help filtering valid tokens from database.

```
var certData = "-----BEGIN CERTIFICATE...END CERTIFICATE-----";
var keyData =  "-----BEGIN RSAPRIVATE KEY...END RSA PRIVATE KEY-----";
var objectCert = {
    certData : certData,
    keyData : keyData
};
var feedback = new (require('./feedback')).FeedBackApns(objectCert, true);
feedback.checkTokensWithFeedback(function (resultStatusArray) {
    console.log(resultStatusArray);
}, function (error) {
    console.log(error);
});
```

This function will return an array of objects :
```
[ { token: '1.token',
    timeStamp: 1231232},
  { token: '2.token',
    timeStamp: 1231232}]
```
TimeStamp is the date when the application had unregistered in UNIX epoch date format.