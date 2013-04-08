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

### 1) Create new object with certificates

```
var certData = "-----BEGIN CERTIFICATE...END CERTIFICATE-----";
var keyData =  "-----BEGIN RSAPRIVATE KEY...END RSA PRIVATE KEY-----";  
var objectCert = {
    certData : certData,
    keyData : keyData
};   
var sender = new (require('./index')).SenderApns(objectCert, true);
```

Enter certificate in “certData” and private key in “keyData”. If using development mode use “false” as second argument.

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
sender.sendThroughApns(apnsMessages, tokens,
         function Success (resultStatusArray) { console.log(resultStatusArray); },
         function (error) { console.log(error); }
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

This module doesn't use timeouts or q or anything similar.
It uses the apns error report for finding the last notification sent and thus confirming the reception of all prior notifications.
It also filters all notifications and tokens prior to sending, speeding up the sending processs.

### Feedback

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