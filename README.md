nodejs-apns-secure
==================

New reliable nodejs module for sending notifications via apns.   
Main advanatages : 

* 1. reliable in time <b>status report</b>
* <b>faster</b> than any other apns module
* robust
* bulk messages

Because of current modules that are slow and unreliable I needed to make a new one. After testing and putting this this module in production I wanted to share this module.
Using this module is very simple :

### 1) Create new object with certificates

```
var certData = "-----BEGIN CERTIFICATE...END CERTIFICATE-----";
var keyData =  "-----BEGIN RSAPRIVATE KEY...END RSA PRIVATE KEY-----";  
var objectCert = {
    certData : certData,
    keyData : keyData
};   
var sender = new (require('./iOSSender')).SenderApns(objectCert, true);
```

In certData comes certificate in string format and in keyData private key.
For using development mode use false as second argument.

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

### 3) Send notificationsa nd receive result status report

```
sender.sendThroughApns(apnsMessages, tokens,
         function Success (resultStatusArray) { console.log(resultStatusArray); },
         function (error) { console.log(error); }
);
```

In tokens array come array of tokens in string.
Messages for sending is array of JSON containing :

    * _id -> notification id
    * expiry -> set 0 for not using it or UNIX epoch date expressed in seconds
    * payload -> data for sending

iOS phone will use this fields from payload :

    * aps.alert -> notification text; if not set notification will not be shown
    * aps.sound -> set to 'default' for using
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
Status contains of :
    * _id -> notification id
    * token
    * status -> 0 for success, 7 for too long payload, 8 for invalid token, 9 for invalid notification


### The magic

This module doesn't use timeouts or q or anything else similar.
It uses apns error report for finding last notification sent and thus confirming receiving of all previous one.