nodejs-apns-secure
==================

New reliable nodejs module for sending notifications via apns.   
Main advanatages : 

* robust
* bulk messages
* status report
* simple to use

Because of current modules that are slow and unreliable I needed to make a new one. After testing and putting this this module in production I wanted to share this module. Using this module is very simple :

### 1) Create new object with certificates

```var certData = "-----BEGIN CERTIFICATE...END CERTIFICATE-----";    
var keyData =  "-----BEGIN RSAPRIVATE KEY...END RSA PRIVATE KEY-----";  
var objectCert = {
    certData : certData,
    keyData : keyData
};   
var sender = new (require('./iOSSender')).SenderApns(objectCert, true);```

In certData comes certificate in string format and in keyData private key.   &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;                                               For using development mode use false as second argument.

### 2) Send notifications


var tokens = ["32 length token", "32 length token"];
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
sender.sendThroughApns([apnsMessage1, apnsMessage2], tokens,
         function Success (array) { console.log(array); },
         function (error) { console.log(error); }
);

In tokens array come array of tokens in string.                
Messages for sending is array of JSON containing &nbsp; _id, expiry and payload.   
If expiry is used, it must be UNIX epoch date expressed in seconds, or can be 0 for not using it.                     
You can custom payload as you but remeber to set aps.alert for displaying message.

### Output array looks like this :   
```
[ { token: '1.token',
    status: 0,
    _id: '1asd1231' },   
  { token: '2.token',
    status: 8,
    _id: '1asd1231' }]```      
Status is given from apns and _id from incomming notification. 0 is for success.