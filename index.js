var tls = require('tls');
var _ = require('underscore');

function SenderApns(objectCert, isProduction) {

    this.host = 'gateway.push.apple.com';
    this.objectCert = objectCert;
    this.resultArray = [];
    this.callsuccess = null;
    this.callerror = null;
    this.notifications = null;
    this.maxReconnectTry = 6;
    this.reconnectTry = 0;
    this.tokens = [];
    this.tlsStream = null;
    this.reconnectTimeout = null;

    if (!isProduction) {
        this.host = 'gateway.sandbox.push.apple.com';
    }
}

SenderApns.prototype.sendThroughApns = function (notifications, tokens, callsuccess, callerror) {

    var self = this;
    self.notifications = notifications;
    self.tokens = tokens;
    self.callsuccess = callsuccess;
    self.callerror = callerror;
    if (!self.isInputValid()) {
        return;
    }

    //set last notification to fail
    notifications.push({expiry : 0, payload : {}, _id : "007"});
    tokens.push("aaa111");

    self.newConnection(function (tlsStream) {
        self.tlsStream = tlsStream;
        _.each(notifications, function (notification, index) {
            tlsStream.write(makeApnsMessage(tokens[index], index, notification));
        });
    });
};

SenderApns.prototype.reSendThroughApns = function (notifications, tokens) {

    var self = this;
    self.notifications = notifications;
    self.tokens = tokens;

    self.newConnection(function (tlsStream) {
        self.tlsStream = tlsStream;
        _.each(notifications, function (notification, index) {
            tlsStream.write(makeApnsMessage(tokens[index], index, notification));
        });
    });
};


SenderApns.prototype.newConnection = function (callsuccess) {

    var self = this;
    var tlsConnectionOptions = {
        port : 2195,
        host : self.host,
        key : self.objectCert.keyData,
        cert : self.objectCert.certData
    };
    if (self.objectCert.passphrase) {
        tlsConnectionOptions.passphrase = self.objectCert.passphrase;
    }

    try {
        var tlsStream = tls.connect(tlsConnectionOptions, function () {
            callsuccess(tlsStream);
        });
    } catch (err) {
        self.callerror(err);
        return;
    }

    tlsStream.on("error", function () {
        self.reconnect();
    });

    tlsStream.on("data", function (data) {
        self.errorResponse(data);
    });
};

SenderApns.prototype.errorResponse = function (data) {

    var self = this;

    if (data[0] === 8) {
        var apnsError = data[1];
        var identifier = data.readUInt32BE(2);
        _.each(self.tokens, function (token, index) {
            if (index < identifier) {
                self.resultArray.push({token : token, status : 0, _id : self.notifications[index]._id});
            }
        });

        if (self.tokens.length === identifier + 1) {
            self.tlsStream.destroySoon();
            if (self.reconnectTimeout) {
                clearTimeout(self.reconnectTimeout);
            }
            self.callsuccess(self.resultArray);
            return;
        }

        if (apnsError !== 8) {
            self.resultArray.push({token : self.tokens[identifier], status : apnsError,  _id : self.notifications[identifier]._id, errorType : "InternalServerError"});
            var tokens = self.tokens.slice(identifier + 1);
            var notifications = self.notifications.slice(identifier + 1);
            self.reSendThroughApns(notifications, tokens);
            return;
        }

        self.removeTokenFromSendingArray(self.tokens[identifier], apnsError);
        var tokens = self.tokens.slice(identifier);
        var notifications = self.notifications.slice(identifier);
        self.reSendThroughApns(notifications, tokens);
        return;
    }
    self.reSendThroughApns(self.notifications, self.tokens);
};

SenderApns.prototype.reconnect = function () {

    var self = this;
    if (self.reconnectTimeout) {
        clearTimeout(self.reconnectTimeout);
    }
    self.reconnectTry += 1;
    if (self.reconnectTry >= self.maxReconnectTry) {
        if (self.resultArray.length > 0) {
            _.each(self.tokens, function (token, index) {
                var result = {token : token, status : 10, _id : self.notifications[index]._id, errorType : "Error in connecting with APNS"};
                self.resultArray.push(result);
            });
            self.callsuccess(self.resultArray);
            return;
        }
        self.callerror("Error in connecting with APNS");
        return;
    }
    self.reconnectTimeout = setTimeout(function () {
        if (self.notifications.length <= 1) {
            return;
        }
        self.reSendThroughApns(self.notifications, self.tokens);
    }, 500 * self.reconnectTry * self.reconnectTry);
};

SenderApns.prototype.removeTokenFromSendingArray = function (invalidToken, apnsError) {

    var self = this;
    var numberNotfDeleted = 0;
    _.each(_.clone(self.tokens), function (token, index) {
        if (token === invalidToken) {
            manageFalseInput(self, index - numberNotfDeleted, apnsError, "InvalidApnsToken");
            numberNotfDeleted += 1;
        }
    });
};

SenderApns.prototype.isInputValid = function () {

    var self = this;
    if (typeof (self.callerror) !== 'function' || typeof (self.callsuccess) !== 'function') {
        return false;
    }
    if (!self.objectCert || !self.objectCert.certData || !self.objectCert.keyData) {
        self.callerror("Object cert is not valid!");
        return false;
    }
    if (!self.notifications || !self.tokens || self.tokens.length !== self.notifications.length) {
        self.callerror("Notifications or tokens are not valid or not the same length!");
        return false;
    }

    var numberNotfDeleted = 0;
    _.each(_.clone(self.notifications), function (notification, index) {
        if (!notification || !notification.payload || !notification._id || isNaN(notification.expiry) || notification.expiry >= 4294967296) {
            manageFalseInput(self, index - numberNotfDeleted, 9, "Invalid notification format");
            numberNotfDeleted += 1;
            return;
        }
        if (JSON.stringify(notification.payload).length > 256) {
            manageFalseInput(self, index - numberNotfDeleted, 7, "Apns payload too long");
            numberNotfDeleted += 1;
        }
    });

    var numberTokDeleted = 0;
    _.each(_.clone(self.tokens), function (token, index) {
        try {
            var tempToken =  new Buffer(token.replace(/\s/g, ""), "hex");
        } catch (error) {
            manageFalseInput(self, index - numberTokDeleted, 8, "InvalidApnsToken");
            numberTokDeleted += 1;
            return;
        }
        if (tempToken.length !== 32) {
            manageFalseInput(self, index - numberTokDeleted, 8, "InvalidApnsToken");
            numberTokDeleted += 1;
        }
    });

    if (self.notifications.length === 0) {
        self.callsuccess(self.resultArray);
        return false;
    }

    return true;
};

function makeApnsMessage(token, identifier, notification) {

    token = new Buffer(token.replace(/\s/g, ""), "hex");
    var encoding = 'utf8';
    var message = JSON.stringify(notification.payload);
    var messageLength = Buffer.byteLength(message, encoding);
    var position = 0;
    var apnsMessage = new Buffer(1 + 4 + 4 + 2 + token.length + 2 + messageLength);

    // Command
    apnsMessage[position] = 1;
    position += 1;
    // Identifier
    apnsMessage.writeUInt32BE(identifier, position);
    position += 4;
    // Expiry
    apnsMessage.writeUInt32BE(notification.expiry, position);
    position += 4;

    // Token Length
    apnsMessage.writeUInt16BE(token.length, position);
    position += 2;
    // Device Token
    token.copy(apnsMessage, position, 0);
    position += token.length;
    // Payload Length
    apnsMessage.writeUInt16BE(messageLength, position);
    position += 2;
    //Payload
    apnsMessage.write(message, position, encoding);
    return apnsMessage;
}

function manageFalseInput(self, index, status, errorType) {
    self.resultArray.push({token : self.tokens[index], status : status,  _id : self.notifications[index]._id, errorType : errorType});
    self.tokens.splice(index, 1);
    self.notifications.splice(index, 1);
}

exports.SenderApns   = SenderApns;