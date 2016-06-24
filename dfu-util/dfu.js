var dfu = {};

(function() {
    'use strict';

    dfu.DETACH = 0x00;
    dfu.DNLOAD = 0x01;
    dfu.UPLOAD = 0x02;
    dfu.GETSTATUS = 0x03;
    dfu.CLRSTATUS = 0x04;
    dfu.GETSTATE = 0x05;
    dfu.ABORT = 6;

    dfu.Device = function(device, settings) {
        this.device_ = device;
        this.settings = settings;
        this.intfNumber = settings["interface"].interfaceNumber;
    };

    dfu.findDeviceDfuInterfaces = function(device) {
        let interfaces = [];
        for (let conf of device.configurations) {
            for (let intf of conf.interfaces) {
                for (let alt of intf.alternates) {
                    if (alt.interfaceClass == 0xFE &&
                        alt.interfaceSubclass == 0x01 &&
                        (alt.interfaceProtocol == 0x01 || alt.interfaceProtocol == 0x02)) {
                        let settings = {
                            "configuration": conf,
                            "interface": intf,
                            "alternate": alt
                        };
                        interfaces.push(settings);
                    }
                }
            }
        }

        return interfaces;
    }

    dfu.findAllDfuInterfaces = function() {
        return navigator.usb.getDevices().then(
            devices => {
                let matches = [];
                for (let device of devices) {
                    let interfaces = dfu.findDeviceDfuInterfaces(device);
                    for (let interface_ of interfaces) {
                        matches.push(new dfu.Device(device, interface_))
                    }
                }
                return matches;
            }
        )
    };

    dfu.Device.prototype.open = function() {
        return this.device_.open()
            .then(() => {
                const confValue = this.settings.configuration.configurationValue;
                if (this.device_.configuration === null ||
                    this.device_.configuration.configurationValue != confValue) {
                    return this.device_.selectConfiguration(confValue);
                }
            })
            .then(() => {
                const intfNumber = this.settings["interface"].interfaceNumber;
                if (!this.device_.configuration.interfaces[intfNumber].claimed) {
                    return this.device_.claimInterface(intfNumber);
                }
                return Promise.resolve();
            })
            .then(() => {
                const intfNumber = this.settings["interface"].interfaceNumber;
                const altSetting = this.settings.alternate.alternateSetting;
                let intf = this.device_.configuration.interfaces[intfNumber];
                if (intf.alternate === null ||
                    intf.alternate.alternateSetting != altSetting) {
                    return this.device_.selectAlternateInterface(intfNumber, altSetting);
                } else {
                    return Promise.resolve();
                }
            });
    }

    dfu.Device.prototype.close = function() {
        return this.device_.close();
    };

    // Permissions don't seem to work out
    /*
    dfu.Device.prototype.readConfigurationDescriptor = function() {
        const GET_DESCRIPTOR = 0x06;
        const DT_CONFIGURATION = 0x02;
        const descIndex = this.settings.configuration.configurationValue;
        const wValue = ((DT_CONFIGURATION << 8) | descIndex);
        
        return this.device_.controlTransferIn({
            "requestType": "standard",
            "recipient": "device",
            "request": GET_DESCRIPTOR,
            "value": wValue,
            "index": 0
        }, 4).then(
            result => {
                if (result.status == "ok") {
                    // Read out length of the configuration descriptor
                    let wLength = result.data.getUint16(2, true);
                    return this.device_.controlTransferIn({
                        "requestType": "standard",
                        "recipient": "device",
                        "request": GET_DESCRIPTOR,
                        "value": wValue,
                        "index": 0
                    }, wLength);
                } else {
                    return Promise.reject(result.status);
                }
            }
        ).then(
            result => {
                if (result.status == "ok") {
                     return Promise.resolve(result.data);
                } else {
                    return Promise.reject(result.status);
                }
            }
        );
    };
    */

    dfu.Device.prototype.requestOut = function(bRequest, data, wValue=0) {
        return this.device_.controlTransferOut({
            "requestType": "class",
            "recipient": "interface",
            "request": bRequest,
            "value": wValue,
            "index": this.intfNumber
        }, data).then(
            result => {
                if (result.status == "ok") {
                    return Promise.resolve(result.bytesWritten);
                } else {
                    return Promise.reject(result.status);
                }
            }
        );
    };

    dfu.Device.prototype.requestIn = function(bRequest, wLength, wValue=0) {
        return this.device_.controlTransferIn({
            "requestType": "class",
            "recipient": "interface",
            "request": bRequest,
            "value": wValue,
            "index": this.intfNumber
        }, wLength).then(
            result => {
                if (result.status == "ok") {
                    return Promise.resolve(result.data);
                } else {
                    return Promise.reject(result.status);
                }
            }
        );
    };

    dfu.Device.prototype.detach = function() {
        return this.requestOut(dfu.DETACH, undefined, 1000);
    };

    dfu.Device.prototype.download = function(data, blockNum) {
        return this.requestOut(dfu.DNLOAD, data, blockNum);
    };

    dfu.Device.prototype.dnload = dfu.Device.prototype.download;

    dfu.Device.prototype.upload = function(length, blockNum) {
        return this.requestIn(dfu.UPLOAD, length, blockNum)
    };

    dfu.Device.prototype.clearStatus = function() {
        return this.requestOut(dfu.CLRSTATUS);
    };

    dfu.Device.prototype.clrStatus = dfu.Device.prototype.clearStatus;

    dfu.Device.prototype.getStatus = function() {
        return this.requestIn(dfu.GETSTATUS, 6).then(
            data => {
                return {
                    "status": data.getUint8(0),
                    "pollTimeout": data.getUint32(1, true) & 0xFFFFFF,
                    "state": data.getUint8(4)
                };
            },
            error => { throw "DFU GETSTATUS failed"; }
        );
    };

    dfu.Device.prototype.getState = function() {
        return this.requestIn(dfu.GETSTATE, 1).then(
            data => data.getUint8(0),
            error => { throw "DFU GETSTATE failed"; }
        );
    };

    dfu.Device.prototype.abort = function() {
        return this.requestOut(dfu.ABORT);
    };

    dfu.Device.prototype.do_upload = function(xfer_size) {
        let transaction = 0;
        let blocks = [];
        console.log("Copying data from DFU device to browser");

        let device = this;
        function upload_success(result) {
            if (result.byteLength > 0) {
                blocks.push(result);
            }
            if (result.byteLength == xfer_size) {
                return device.upload(xfer_size, transaction++).then(upload_success);
            } else {
                return Promise.resolve(new Blob(blocks, { type: "application/octet-stream" }));
            }
        }
        
        return device.upload(xfer_size, transaction).then(upload_success);
    };
    
})();
