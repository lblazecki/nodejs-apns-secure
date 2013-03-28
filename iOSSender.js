var tls = require('tls');
var _ = require('underscore');

function SenderApns(objectCert, production) {

    this.host = 'gateway.push.apple.com';
    this.objectCert = objectCert;
    this.resultArray = [];
    this.callsuccess = null;
    this.callsuccess = null;
    this.notifications = null;
    this.reconnectTry = 0;
    this.tokens = [];
    this.tlsStream = null;

    if (!production) {
        this.host = 'gateway.sandbox.push.apple.com';
    }

}

SenderApns.prototype.sendThroughApns = function (notifications, tokens, callsuccess, callerror) {

    var self = this;
    self.notifications = notifications;
    self.tokens = tokens;
    self.callsuccess = callsuccess;
    self.callerror = callerror;
    if (!this.isInputValid()) {
        return;
    }

    //set last notification to fail
    notifications.push({expiry : 30000, payload : {}, _id : "007"});
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

    //tlsStream.on("close", function () { console.log("close"); });
    //tlsStream.on("end", function () { console.log("end"); });
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
            if (index === identifier && self.tokens.length !== identifier + 1) {
                self.resultArray.push({token : token, status : apnsError,  _id : self.notifications[index]._id});
            }
        });

        if (self.tokens.length === identifier + 1) {
            self.tlsStream.destroySoon();
            self.callsuccess(self.resultArray);
            return;
        }

        var tokens = self.tokens.slice(identifier + 1);
        var notifications = self.notifications.slice(identifier + 1);
        self.reSendThroughApns(notifications, tokens);
    }
};

SenderApns.prototype.reconnect = function () {

    var self = this;
    self.reconnectTry += 1;
    setTimeout(function () {
        self.reSendThroughApns(self.notifications, self.tokens);
    }, 1000 * self.reconnectTry * self.reconnectTry);
};

SenderApns.prototype.isInputValid = function () {

    var isValid = true;
    if (typeof (this.callerror) !== 'function' || typeof (this.callsuccess) !== 'function') {
        return false;
    }
    if (!this.objectCert || !this.objectCert.certData || !this.objectCert.keyData) {
        this.callerror("Object cert is not valid!");
        return false;
    }
    if (!this.notifications || !this.tokens || this.tokens.length !== this.notifications.length) {
        this.callerror("Notifications or tokens are not valid or not the same length!");
        return false;
    }
    _.each(this.notifications, function (notification) {
        if (!notification || !notification.payload || !notification._id || isNaN(notification.expiry)) {
            isValid = false;
        }
    });
    if (!isValid) {
        this.callerror("Some notification is not valid!");
        return false;
    }
    _.each(this.tokens, function (token) {
        try {
            var tempToken =  new Buffer(token.replace(/\s/g, ""), "hex");
        } catch (error) {
            isValid = false;
            return;
        }
        if (tempToken.length !== 32) {
            isValid = false;
        }
    });
    if (!isValid) {
        this.callerror("Some token is not valid!");
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

exports.SenderApns   = SenderApns;