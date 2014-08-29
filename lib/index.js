var tls = require('tls');
var Promise = require('bluebird');
var debug = require('debug')('apnsSender');
var _ = require('lodash');

function SenderApns(authObject, options) {

    authObject = (typeof authObject === 'object') ? authObject : {};
    options = (typeof options === 'object') ? options : {};
    this.maxReconnectTry = options.maxReconnectTry || 6;
    this.sendingTimeout = options.sendingTimeout || 20000;
    this.host = options.host || (options.isProduction) ? 'gateway.push.apple.com' : 'gateway.sandbox.push.apple.com';

    this.tlsConnectionOptions = {
        port : options.port || 2195,
        host : this.host
    };

    this.tlsConnectionOptions = _.merge(authObject, this.tlsConnectionOptions);

    this.reconnectTry = 0;
    this.resultArray = [];

    debug('Initialized SenderApns object');

    this.makeApnsMessage = function(token, identifier, notification) {

        if (notification.priority !== 5 || notification.priority !== 10) {
            if (notification && notification.payload && notification.payload.aps && notification.payload.aps['content-available'] === 1) {
                notification.priority = 5;
            } else {
                notification.priority = 10;
            }
        }

        var position = 0;
        token = new Buffer(token.replace(/\s/g, ''), 'hex');
        var message = JSON.stringify(notification.payload);
        var messageLength = Buffer.byteLength(message, 'utf8');
        var apnsMessage;

        // New Protocol uses framed notifications consisting of multiple items
        // 1: Device Token
        // 2: Payload
        // 3: Notification Identifier
        // 4: Expiration Date
        // 5: Priority
        // Each item has a 3 byte header: Type (1), Length (2) followed by data
        // The frame layout is hard coded for now as original dynamic system had a
        // significant performance penalty

        var frameLength = (3 + token.length) + (3 + messageLength) + 7 + 7 + 4;

        // Frame has a 5 byte header: Type (1), Length (4) followed by items.
        apnsMessage = new Buffer(5 + frameLength);
        apnsMessage[position] = 2; position += 1;

        // Frame Length
        apnsMessage.writeUInt32BE(frameLength, position); position += 4;

        // Token Item
        apnsMessage[position] = 1; position += 1;
        apnsMessage.writeUInt16BE(token.length, position); position += 2;
        position += token.copy(apnsMessage, position, 0);

        // Payload Item
        apnsMessage[position] = 2; position += 1;
        apnsMessage.writeUInt16BE(messageLength, position); position += 2;
        position += apnsMessage.write(message, position, 'utf8');

        // Identifier Item
        apnsMessage[position] = 3; position += 1;
        apnsMessage.writeUInt16BE(4, position); position += 2;
        apnsMessage.writeUInt32BE(identifier, position); position += 4;

        // Expiry Item
        apnsMessage[position] = 4; position += 1;
        apnsMessage.writeUInt16BE(4, position); position += 2;
        apnsMessage.writeUInt32BE(notification.expiry, position); position += 4;

        // Priority Item
        apnsMessage[position] = 5; position += 1;
        apnsMessage.writeUInt16BE(1, position); position += 2;
        apnsMessage[position] = notification.priority; position += 1;

        return apnsMessage;
    };
}

SenderApns.prototype.send = Promise.method(function(notifications, tokens) {
    var self = this;

    return Promise.resolve(self.checkInput(notifications, tokens)).then(function () {
        if (notifications.length === 0) {
            return self.resultArray;
        }

        //set last notification to fail
        notifications.push({expiry : 0, payload : {}, _id : '007'});
        tokens.push('aaa111');

        return self.sendToApns(notifications, tokens);
    });
});


SenderApns.prototype.sendToApns = Promise.method(function(notificationsForSending, tokensForSending) {
    var self = this;

    debug('Sending with notifications : ' + JSON.stringify(notificationsForSending));
    debug('Sending with tokens : ' + JSON.stringify(tokensForSending));

    return self.sendThroughTls(notificationsForSending, tokensForSending)
        .then(function (data) {
            debug('Some notifications sent through APNS');
            self.reconnectTry = 0;
            return self.handleApnsResponse(data, notificationsForSending, tokensForSending).spread(function (notificationsForResend, tokensForResend) {
                return self.resend(notificationsForResend, tokensForResend);
            });
        }).catch(function (error) {
            debug('Error in connecting to APNS, error is : ' + error.message);
            return self.handleReconnect(error, notificationsForSending, tokensForSending).spread(function (notificationsForResend, tokensForResend) {
                return self.resend(notificationsForResend, tokensForResend);
            });
        });
});

SenderApns.prototype.resend = Promise.method(function(notificationsForResend, tokensForResend) {
    var self = this;

    if (notificationsForResend.length === 0) {
        debug('Finished sending');
        return self.resultArray;
    }

    debug('Resending with notifications : ' + JSON.stringify(notificationsForResend));
    debug('Resending with tokens : ' + JSON.stringify(tokensForResend));

    return self.sendToApns(notificationsForResend, tokensForResend);
});

// the most sensitive part of sending
// it cannot be broken to smaller pieces
// steps :
/*
1. create outer promise that can be cancel if communication to APNS takes to long
2. create timeout object that will cancel outer promise (and thus raise error) and destroy connection
3. create new inner promise inside the outer one that will handle tls and event listeners
4. create connection to tls
5. create event listeners to tls connection
6. if this promise is resolved or rejected clear & destroy timeout object
 */
SenderApns.prototype.sendThroughTls = Promise.method(function(notifications, tokens) {
    var self = this;
    var connectionFinished = false;
    var tlsStream;

    return new Promise(function (resolve, reject) {
        var timeoutObject = setTimeout(function () {
            debug('Connection has stuck, canceling current sending');
            connectionFinished = true;

            if (tlsStream) {
                tlsStream.destroy();
            }
            promiseSendThroughTls.cancel();
        }, self.sendingTimeout);

        debug('Creating new connection');
        var promiseSendThroughTls = Promise.resolve()
            .cancellable()
            .then(function () {
                debug('New connection created');
                return new Promise(function (resolve, reject) {
                    try {
                        tlsStream = tls.connect(self.tlsConnectionOptions, function () {
                            _.each(notifications, function (notification, index) {
                                debug('Writing ' + index + '. notification');
                                var apnsMessage = self.makeApnsMessage(tokens[index], index, notification);
                                tlsStream.write(apnsMessage);
                            });
                        });
                    } catch (err) {
                        if (!connectionFinished) {
                            connectionFinished = true;
                            if (tlsStream) {
                                tlsStream.destroy();
                            }
                            reject(err);
                        }
                    }

                    tlsStream.on('error', function (err) {
                        if (!connectionFinished) {
                            connectionFinished = true;
                            tlsStream.destroy();
                            reject(err);
                        }
                    });

                    tlsStream.on('data', function (data) {
                        connectionFinished = true;
                        tlsStream.destroy();
                        resolve(data);
                    });

                    tlsStream.on('close', function () {
                        if (!connectionFinished) {
                            tlsStream.destroy();
                            reject(new Error('Connection closed by APNS'));
                        }
                    });
                });
            })
            .then(function (arg) {
                clearTimeout(timeoutObject);
                resolve(arg);
            })
            .catch(function (error) {
                clearTimeout(timeoutObject);
                reject(error);
            });
    });
});


SenderApns.prototype.handleApnsResponse = Promise.method(function(data, notificationsSent, tokensSent) {
    var self = this;

    if (data[0] !== 8) {
        throw new Error('Apns returned strange error, first byte is not 8, but : ' + data[0]);
    }

    var apnsError = data[1];
    var identifier = data.readUInt32BE(2);
    // all pairs of tokens/notification until this one are successfully sent
    _.each(tokensSent, function (token, index) {
        if (index < identifier) {
            self.resultArray.push({token : token, status : 0, _id : notificationsSent[index]._id});
        }
    });

    // if there is an error on last token, which is always wrong, sending is over, nothing to resend
    if (tokensSent.length === identifier + 1) {
        return [[], []];
    }

    var tokensToResend;
    var notificationsToResend;

    // if there is error 8 (invalid token) remove all pairs of this token/notification from sending array and resend the rest
    if (apnsError === 8) {
        self.removePairsFromSendingArray(tokensSent[identifier], apnsError, notificationsSent, tokensSent);
        tokensToResend = tokensSent.slice(identifier);
        notificationsToResend = notificationsSent.slice(identifier);
    }
    // for any other error remove just this pair of token/notification and resend the rest
    else {
        self.resultArray.push({token : tokensSent[identifier], status : apnsError,  _id : notificationsSent[identifier]._id, errorType : 'InternalServerError'});
        tokensToResend = tokensSent.slice(identifier + 1);
        notificationsToResend = notificationsSent.slice(identifier + 1);
    }

    return [notificationsToResend, tokensToResend];
});

SenderApns.prototype.handleReconnect = Promise.method(function (error, notifications, tokens) {
    var self = this;
    self.reconnectTry += 1;

    debug('Reconnecting to APNS for the ' + self.reconnectTry + '. time');
    if (self.maxReconnectTry > self.reconnectTry) {
        var reconnectTimeout = 1000 * self.reconnectTry * self.reconnectTry;

        return Promise.delay(reconnectTimeout).then(function() {
            return [notifications, tokens];
        });
    } else {
        var errorMessage = 'Error in connecting with APNS, error is: ' + error;

        if (self.resultArray.length === 0) {
            throw new Error(errorMessage);
        }

        var tokensWithoutLastInvalidToken = tokens.slice(0, tokens.length-1);
        tokensWithoutLastInvalidToken.forEach(function (token, index) {
            var result = {token : token, status : 10, _id : notifications[index]._id, errorType : errorMessage};
            self.resultArray.push(result);
        });

        return [[], []];
    }
});

// remove all pairs of tokens/notifications from sending array that contains this token
SenderApns.prototype.removePairsFromSendingArray = Promise.method(function (invalidToken, apnsError, notificationsSent, tokensSent) {
    var self = this;
    var numberNotificationsDeleted = 0;

    _.each(_.clone(tokensSent), function (token, index) {
        if (token === invalidToken) {
            self.manageFalseInput(notificationsSent, tokensSent, index - numberNotificationsDeleted, apnsError, 'InvalidApnsToken');
            numberNotificationsDeleted += 1;
        }
    });
});

SenderApns.prototype.checkInput = Promise.method(function(notificationsForSending, tokensForSending) {
    var self = this;

    debug('Checking input parameters notifications : ' + JSON.stringify(notificationsForSending));
    debug('Checking input parameters tokens : ' + JSON.stringify(tokensForSending));

    if (!notificationsForSending || !tokensForSending || tokensForSending.length !== notificationsForSending.length) {
        throw new Error('Notifications or tokens are not valid or not the same length!');
    }

    var numberNotificationsDeleted = 0;
    _.each(_.clone(notificationsForSending), function (notification, index) {
        if (!notification || !notification.payload || !notification._id || isNaN(notification.expiry) || notification.expiry >= 4294967296) {
            self.manageFalseInput(notificationsForSending, tokensForSending, index - numberNotificationsDeleted, 9, 'Invalid notification format');
            numberNotificationsDeleted += 1;
            return;
        }
        if (JSON.stringify(notification.payload).length > 256) {
            self.manageFalseInput(notificationsForSending, tokensForSending, index - numberNotificationsDeleted, 7, 'Apns payload too long');
            numberNotificationsDeleted += 1;
        }
    });

    var numberTokensDeleted = 0;
    _.each(_.clone(tokensForSending), function (token, index) {
        var tempToken;
        try {
            tempToken = new Buffer(token.replace(/\s/g, ''), 'hex');
        } catch (error) {
            self.manageFalseInput(notificationsForSending, tokensForSending, index - numberTokensDeleted, 8, 'InvalidApnsToken');
            numberTokensDeleted += 1;
            return;
        }
        if (tempToken.length !== 32) {
            self.manageFalseInput(notificationsForSending, tokensForSending, index - numberTokensDeleted, 8, 'InvalidApnsToken');
            numberTokensDeleted += 1;
        }
    });

    debug('Input parameters verified');
});

SenderApns.prototype.manageFalseInput = Promise.method(function(notifications, tokens, index, status, errorType) {
    var self = this;

    self.resultArray.push({token : tokens[index], status : status,  _id : notifications[index]._id, errorType : errorType});
    tokens.splice(index, 1);
    notifications.splice(index, 1);
});

module.exports = SenderApns;