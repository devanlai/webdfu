/* @license
 *
 * Copyright 2015 ARM Ltd
 */
(function(root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module
        define(['jquery'], factory);
    } else if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS
        module.exports = factory(require('jquery'));
    } else {
        // Browser global (with support for web workers)
        root.mbedCompileApi = factory(root.$);
    }
}(this, function($) {
    'use strict';

    var defaultApi = "https://os.mbed.com/api/v2/tasks/compiler/";

    // Constructor
    var mbedCompileApi = function(logFn, api) {
        this.logFn = logFn;
        this.api = api || defaultApi;
    };

    // Read symbols dictionary from inputs
    mbedCompileApi.prototype.symbolsFromElement = function(element) {
        var symbols = {};
        var inputs = element.querySelectorAll("input");

        for (var i = 0; i < inputs.length; i++) {
            var input = inputs[i];
            var value = input.value;
            if (input.type === "text") value = '"' + value +'"';
            symbols[input.name] = value;
        }

        return symbols;
    };

    // Set Credentials
    mbedCompileApi.prototype.setCredentials = function(username, password) {
        var tok = username + ':' + password;
        $.ajaxSetup({
            headers: {
                "Authorization": "Basic " + btoa(tok)
            }
        });
    };

    // Build a public repository
    // repo must be a fully qualified URL to the code location
    mbedCompileApi.prototype.buildRepo = function(symbols, repo, target) {
        this.repomode = true;
        this.build(symbols, repo, target)
    };

    mbedCompileApi.prototype.buildRepoAsPromise = function(symbols, repo, target) {
        var mbed = this;
        let promise = new Promise(function (resolve, reject) {
            mbed.resolve = resolve;
            mbed.reject = reject;
        });
        
        this.repomode = true;
        this.build(symbols, repo, target);

        return promise;
    };

    // Build a program in users workspace
    mbedCompileApi.prototype.buildProgram = function(symbols, program, target) {        
        this.repomode = false;
        this.build(symbols, program, target)
    };

    mbedCompileApi.prototype.buildProgramAsPromise = function(symbols, program, target) {
        var mbed = this;
        let promise = new Promise(function (resolve, reject) {
            mbed.resolve = resolve;
            mbed.reject = reject;
        });

        this.repomode = false;
        this.build(symbols, program, target);

        return promise;
    };

    // Build a program in users workspace
    mbedCompileApi.prototype.build = function(symbols, code, target) {
        var symbolsArray = [];

        Object.keys(symbols).forEach(function(symbol) {
            symbolsArray.push(symbol + "=" + symbols[symbol]);
        });

        var payload = {
            platform: target,
            clean: true,
            extra_symbols: symbolsArray.join(",")
        };
        // set repo or program mode accordingly
        if(this.repomode === true){
            payload['repo'] = code;
        }else{
            payload['program'] = code;
        }

        this.retryBuild(payload);
    };

    // Keep trying to initiate build every 200ms until it works
    mbedCompileApi.prototype.retryBuild = function(payload) {
        this.initiateBuild(payload, function(success) {
            if (!success) {
                setTimeout(function() {
                    this.retryBuild(payload);
                }.bind(this), 200);
            }
        }.bind(this));
    };

    // Start the build
    mbedCompileApi.prototype.initiateBuild = function(payload, callback) {
        $.ajax({
            url: this.api + "start/",
            type: "POST",
            data: payload,
            success: function(response) {
                var uuid = response.result.data.task_id;
                this.uuid = uuid;
                this.logFn(uuid);
                setTimeout(function() {
                    this.pollProgress(uuid);
                }.bind(this), 0);
                callback(true);
            }.bind(this),
            error: function(response) {
                if (response.status === 500) {
                    callback(false);
                } else {
                    this.logFn(response.responseText);
                    callback(true);
                }
            }.bind(this)
        });
    };

    // See how we are getting on
    mbedCompileApi.prototype.pollProgress = function(uuid) {
        $.ajax({
            url: this.api + "output/" + uuid,
            success: function(response) {
                var messages = response.result.data.new_messages;

                for (var i in messages) {
                    var message = messages[i];

                    if (message.message) {
                        this.logFn(message.type + ": " + message.message);
                    }

                    if (message.action && message.percent) {
                        this.logFn(message.action + ": " + message.percent);
                    } else if (message.action) {
                        this.logFn(message.action + ": " + message.file);
                    }
                }

                if (response.result.data.task_complete) {
                    if (response.result.data.compilation_success) {
                        this.logFn("success");
                        if (typeof this.resolve !== "undefined") {
                            let resolve = this.resolve;
                            let reject = this.reject;
                            this.resolve = undefined;
                            this.reject = undefined;
                            this.downloadAsPromise(response.result.data, uuid).then(resolve, reject);
                        } else {
                            this.downloadFile(response.result.data, uuid);
                        }
                    } else {
                        this.logFn("failed");
                    }
                } else {
                    setTimeout(function() {
                        this.pollProgress(uuid);
                    }.bind(this), 0);
                }
            }.bind(this),
            error: function(response) {
                this.logFn(response.responseText);
            }.bind(this)
        });
    };

    // cancel build
    mbedCompileApi.prototype.cancelBuild = function(){
        $.ajax({
            url: this.api + "cancel/",
            type: "POST",
            data: {task_id:this.uuid},
            success: function(response) {
                this.logFn("...Build cancelled sucessfully");
            }.bind(this),
            error: function(response) {
                if (response.status === 500) {
                    callback(false);
                } else {
                    this.logFn(response.responseText);
                    callback(true);
                }
            }.bind(this)
        });
    };

    // Download our built file
    mbedCompileApi.prototype.downloadFile = function(data, uuid) {
        var payload = {
            program: data.program,
            binary: data.binary,
            task_id: uuid
        };
        // add repomode if compiling a repo
        if(this.repomode === true){
            payload['repomode'] = this.repomode;
        };

        $.ajax({
            url: this.api + "bin/",
            data: payload,
            dataType: "blob",
            success: function(response, status, xhr) {
                var filename = data.binary;
                var type = xhr.getResponseHeader('Content-Type');
                var blob = new Blob([response], { type: type });

                if (typeof window.navigator.msSaveBlob !== 'undefined') {
                    window.navigator.msSaveBlob(blob, filename);
                } else {
                    var URL = window.URL || window.webkitURL;
                    var downloadUrl = URL.createObjectURL(blob);

                    var a = document.createElement("a");
                    if (typeof a.download === 'undefined') {
                        window.location.href = downloadUrl;
                    } else {
                        a.href = downloadUrl;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();

                        // Cleanup
                        setTimeout(function() {
                            URL.revokeObjectURL(downloadUrl);
                        }, 500);
                    }
                }
            },
            error: function(response) {
                this.logFn(response.responseText);
            }.bind(this)
        });
    };

    // Get the built file as a blob promise
    mbedCompileApi.prototype.downloadAsPromise = function(data, uuid) {
        var payload = {
            program: data.program,
            binary: data.binary,
            task_id: uuid
        };
        // add repomode if compiling a repo
        if(this.repomode === true){
            payload['repomode'] = this.repomode;
        };

        var mbed = this;

        let downloadPromise = new Promise(function (resolve, reject) {
            $.ajax({
                url: mbed.api + "bin/",
                data: payload,
                dataType: "blob",
                success: function(response, status, xhr) {
                    var filename = data.binary;
                    var type = xhr.getResponseHeader('Content-Type');
                    var blob = new Blob([response], { type: type });
                    var result = {
                        "metadata": data,
                        "blob": blob,
                    }
                    resolve(result);
                },
                error: function(response) {
                    reject(response.responseText);
                }.bind(mbed)
            });
        });

        return downloadPromise;
    };

    // jQuery extension to support blob downlaods
    $.ajaxTransport("+*", function(options, originalOptions, jqXHR){
        if (options.dataType && options.dataType == "blob") {
            return {
                send: function(headers, completeCallback){
                    var xhr = new XMLHttpRequest();
                    var url = options.url || window.location.href;
                    var type = options.type || "GET";
                    var dataType = options.dataType;
                    var data = options.data || null;
                    var async = options.async || true;

                    xhr.addEventListener("load", function() {
                        var response = {};
                        response[dataType] = xhr.response;
                        completeCallback(xhr.status, xhr.statusText, response, xhr.getAllResponseHeaders());
                    });

                    xhr.open(type, url, async);
                    for (var header in headers) {
                        xhr.setRequestHeader(header, headers[header]);
                    }

                    xhr.responseType = dataType;
                    xhr.send(data);
                },
                abort: function(){
                    jqXHR.abort();
                }
            };
        }
    });

    return mbedCompileApi;
}));
