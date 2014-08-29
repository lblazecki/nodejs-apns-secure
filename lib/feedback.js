var tls = require('tls');
var _ = require('underscore');


function FeedBackApns(objectCert, isProduction) {

    this.feedbackHost = 'feedback.push.apple.com';
    this.objectCert = objectCert;
    this.resultArray = [];
    this.callsuccess = null;
    this.callerror = null;
    this.maxReconnectTry = 6;
    this.reconnectTry = 0;
    this.tlsStream = null;

    this.isInError = false;
    this.isInData = false;
    this.isFinished = false;

    if (!isProduction) {
        this.feedbackHost = 'feedback.sandbox.push.apple.com';
    }
}

FeedBackApns.prototype.checkTokensWithFeedback = function (callsuccess, callerror) {

    var self = this;
    self.callsuccess = callsuccess;
    self.callerror = callerror;
    if (!self.isInputValid()) {
        return;
    }

    self.newConnection();
};

FeedBackApns.prototype.newConnection = function () {

    var self = this;
    var tlsConnectionOptions = {
        port : 2196,
        host : self.feedbackHost,
        key : self.objectCert.keyData,
        cert : self.objectCert.certData
    };
    if (self.objectCert.passphrase) {
        tlsConnectionOptions.passphrase = self.objectCert.passphrase;
    }

    try {
        var tlsStream = tls.connect(tlsConnectionOptions, function () {
            self.tlsStream = tlsStream;
        });
    } catch (err) {
        self.callerror(err);
        return;
    }

    tlsStream.on("error", function () {
        self.isInError = true;
        self.reconnect();
    });

    tlsStream.on("data", function (data) {
        self.isInData = true;
        self.handleResults(data);
    });

    tlsStream.on("end", function () {
        self.isFinished = true;
        if (!self.isInError && !self.isInData) {
            self.callsuccess(self.resultArray);
        }
    });
};

FeedBackApns.prototype.handleResults = function (data) {

    var self = this;
    while (data.length > 0) {
        var timeStamp = data.readUInt32BE(0);
        var tokenLength = data.readUInt16BE(4);
        var token = new Buffer(tokenLength);
        data.copy(token, 0, 6, 6 + tokenLength);

        self.resultArray.push({token : token.toString('hex'), timeStamp : timeStamp});
        data = data.slice(6 + tokenLength);
    }
    self.isInData = false;
    if (self.isFinished) {
        self.callsuccess(self.resultArray);
    }
};

FeedBackApns.prototype.reconnect = function () {

    var self = this;
    self.reconnectTry += 1;
    if (self.reconnectTry >= self.maxReconnectTry) {
        if (self.resultArray.length > 0) {
            self.callsuccess(self.resultArray);
            return;
        }
        self.callerror("Error in connecting with APNS");
        return;
    }
    setTimeout(function () {
        self.isInError = false;
        self.newConnection();
    }, 500 * self.reconnectTry * self.reconnectTry);
};

FeedBackApns.prototype.isInputValid = function () {

    var self = this;
    if (typeof (self.callerror) !== 'function' || typeof (self.callsuccess) !== 'function') {
        return false;
    }
    if (!self.objectCert || !self.objectCert.certData || !self.objectCert.keyData) {
        self.callerror("Object cert is not valid!");
        return false;
    }

    return true;
};

exports.FeedBackApns   = FeedBackApns;