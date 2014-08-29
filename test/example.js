var ApnsSender = require('./../index');
var token1 = "11111a960806fcfa8f4abc73e015b7a730118c783a6dcede5dda9f34e6fe9270";
var token2 = "11111a960806fcfa8f4abc73e015b7a730118c783a6dcede5dda9f34e6fe9270";


var certData = "-----BEGIN CERTIFICATE-----\n\n-----END CERTIFICATE-----";
var keyData =  "-----BEGIN RSA PRIVATE KEY-----\n\n-----END RSA PRIVATE KEY-----";
var apnsMessage1 = {
    expiry :  Math.floor(Date.now() / 1000) + 300,
    _id : "1asd1231"
};
var apnsMessage2 = {
    _id : "1asd1231"
};
var objectCert = {
    cert : certData,
    key : keyData
};
apnsMessage1.payload = apnsMessage2.payload = {
    'aps': {"badge" : "123", "alert" : "Test it bulk", "sound" : "default"},
    'type': "text/html",
    'mimeType': "text/html",
    'messageID' : "1asd1231"
};

//var feedback = new (require('./../feedback')).FeedBackApns(objectCert, true);
//feedback.checkTokensWithFeedback(function (resultStatusArray) {
//    console.log(resultStatusArray);
//}, function (error) {
//    console.log(error);
//});

var apnsSender = new ApnsSender(objectCert, {isProduction : false})
    .then(function (array) {
        console.log(array);
    }).catch(function (error) {
        console.log(error);
        console.log(error.stack);
    });