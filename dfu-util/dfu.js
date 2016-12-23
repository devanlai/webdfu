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

    dfu.appIDLE = 0;
    dfu.appDETACH = 1;
    dfu.dfuIDLE = 2;
    dfu.dfuDNLOAD_SYNC = 3;
    dfu.dfuDNBUSY = 4;
    dfu.dfuDNLOAD_IDLE = 5;
    dfu.dfuMANIFEST_SYNC = 6;
    dfu.dfuMANIFEST = 7;
    dfu.dfuMANIFEST_WAIT_RESET = 8;
    dfu.dfuUPLOAD_IDLE = 9;
    dfu.dfuERROR = 10;

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

    dfu.Device.prototype.logDebug = function(msg) {

    };

    dfu.Device.prototype.logInfo = function(msg) {
        console.log(msg);
    };

    dfu.Device.prototype.logWarning = function(msg) {
        console.log(msg);
    };

    dfu.Device.prototype.logError = function(msg) {
        console.log(msg);
    };

    dfu.Device.prototype.logProgress = function(done, total) {
        if (typeof total === 'undefined') {
            console.log(done)
        } else {
            console.log(done + '/' + total);
        }
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

    dfu.Device.prototype.readDeviceDescriptor = function() {
        const GET_DESCRIPTOR = 0x06;
        const DT_DEVICE = 0x01;
        const wValue = (DT_DEVICE << 8);

        return this.device_.controlTransferIn({
            "requestType": "standard",
            "recipient": "device",
            "request": GET_DESCRIPTOR,
            "value": wValue,
            "index": 0
        }, 18).then(
            result => {
                if (result.status == "ok") {
                     return Promise.resolve(result.data);
                } else {
                    return Promise.reject(result.status);
                }
            }
        );
    };

    dfu.parseDeviceDescriptor = function(data) {
        return {
            bLength:            data.getUint8(0),
            bDescriptorType:    data.getUint8(1),
            bcdUSB:             data.getUint16(2, true),
            bDeviceClass:       data.getUint8(4),
            bDeviceSubClass:    data.getUint8(5),
            bDeviceProtocol:    data.getUint8(6),
            bMaxPacketSize:     data.getUint8(7),
            idVendor:           data.getUint16(8, true),
            idProduct:          data.getUint16(10, true),
            bcdDevice:          data.getUint16(12, true),
            iManufacturer:      data.getUint8(14),
            iProduct:           data.getUint8(15),
            iSerialNumber:      data.getUint8(16),
            bNumConfigurations: data.getUint8(17),
        };
    };

    dfu.parseConfigurationDescriptor = function(data) {
        let descriptorData = new DataView(data.buffer.slice(9));
        let descriptors = dfu.parseSubDescriptors(descriptorData);
        return {
            bLength:            data.getUint8(0),
            bDescriptorType:    data.getUint8(1),
            wTotalLength:       data.getUint16(2, true),
            bNumInterfaces:     data.getUint8(4),
            bConfigurationValue:data.getUint8(5),
            iConfiguration:     data.getUint8(6),
            bmAttributes:       data.getUint8(7),
            bMaxPower:          data.getUint8(8),
            descriptors:        descriptors
        };
    };

    dfu.parseInterfaceDescriptor = function(data) {
        return {
            bLength:            data.getUint8(0),
            bDescriptorType:    data.getUint8(1),
            bInterfaceNumber:   data.getUint8(2),
            bAlternateSetting:  data.getUint8(3),
            bNumEndpoints:      data.getUint8(4),
            bInterfaceClass:    data.getUint8(5),
            bInterfaceSubClass: data.getUint8(6),
            bInterfaceProtocol: data.getUint8(7),
            iInterface:         data.getUint8(8),
            descriptors:        []
        };
    };

    dfu.parseFunctionalDescriptor = function(data) {
        return {
            bLength:           data.getUint8(0),
            bDescriptorType:   data.getUint8(1),
            bmAttributes:      data.getUint8(2),
            wDetachTimeOut:    data.getUint16(3, true),
            wTransferSize:     data.getUint16(5, true),
            bcdDFUVersion:     data.getUint16(7, true)
        };
    };

    dfu.parseSubDescriptors = function(descriptorData) {
        const DT_INTERFACE = 4;
        const DT_ENDPOINT = 5;
        const DT_DFU_FUNCTIONAL = 0x21;
        const USB_CLASS_APP_SPECIFIC = 0xFE;
        const USB_SUBCLASS_DFU = 0x01;
        let remainingData = descriptorData;
        let descriptors = [];
        let currIntf;
        let inDfuIntf = false;
        while (remainingData.byteLength > 2) {
            let bLength = remainingData.getUint8(0);
            let bDescriptorType = remainingData.getUint8(1);
            let descData = new DataView(remainingData.buffer.slice(0, bLength));
            if (bDescriptorType == DT_INTERFACE) {
                currIntf = dfu.parseInterfaceDescriptor(descData);
                if (currIntf.bInterfaceClass == USB_CLASS_APP_SPECIFIC &&
                    currIntf.bInterfaceSubClass == USB_SUBCLASS_DFU) {
                    inDfuIntf = true;
                } else {
                    inDfuIntf = false;
                }
                descriptors.push(currIntf);
            } else if (inDfuIntf && bDescriptorType == DT_DFU_FUNCTIONAL) {
                let funcDesc = dfu.parseFunctionalDescriptor(descData)
                descriptors.push(funcDesc);
                currIntf.descriptors.push(funcDesc)
            } else {
                let desc = {
                    bLength: bLength,
                    bDescriptorType: bDescriptorType,
                    data: descData
                };
                descriptors.push(desc);
                if (currIntf) {
                    currIntf.descriptors.push(desc);
                }
            }
            remainingData = new DataView(remainingData.buffer.slice(bLength));
        }

        return descriptors;
    };

    dfu.Device.prototype.readConfigurationDescriptor = function(index) {
        const GET_DESCRIPTOR = 0x06;
        const DT_CONFIGURATION = 0x02;
        const wValue = ((DT_CONFIGURATION << 8) | index);

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
        let bytes_read = 0;

        this.logInfo("Copying data from DFU device to browser");

        let device = this;
        function upload_success(result) {
            if (result.byteLength > 0) {
                blocks.push(result);
                bytes_read += result.byteLength;
            }

            if (result.byteLength == xfer_size) {
                // Update progress
                device.logProgress(bytes_read);
                return device.upload(xfer_size, transaction++).then(upload_success);
            } else {
                // Update progress
                device.logProgress(bytes_read, bytes_read);
                return Promise.resolve(new Blob(blocks, { type: "application/octet-stream" }));
            }
        }

        // Initialize progress to 0
        device.logProgress(0);

        return device.upload(xfer_size, transaction).then(upload_success);
    };

    dfu.Device.prototype.poll_until_idle = function(result, idleState) {
        if (result.state == idleState || result.state == dfu.dfuERROR) {
            return Promise.resolve(result);
        } else {
            let self = this;
            let deferred = new Promise(function (resolve, reject) {
                function poll_after_sleeping() {
                    resolve(device.getStatus().then(
                        result => self.poll_until_idle(result, idleState),
                        error => { throw "Error during getStatus: " + error; })
                    );
                }
                device.logDebug("Sleeping for " + result.pollTimeout + "ms");
                setTimeout(poll_after_sleeping, result.pollTimeout);
            });
            return deferred;
        }
    };

    dfu.Device.prototype.do_download = function(xfer_size, data) {
        let bytes_sent = 0;
        let expected_size = data.byteLength;
        let transaction = 0;

        this.logInfo("Copying data from browser to DFU device");

        let device = this;
        function poll_until_download_idle(result) {
            return device.poll_until_idle(result, dfu.dfuDNLOAD_IDLE);
        }

        function poll_until_dfu_idle(result) {
            return device.poll_until_idle(result, dfu.dfuIDLE);
        }

        let downloadOperation = new Promise(function (resolve, reject) {
            function download_success(bytes_written) {
                bytes_sent += bytes_written;

                // Update progress
                device.logProgress(bytes_sent, expected_size);

                device.logDebug("Wrote " + bytes_written + " bytes");
                let bytes_left = expected_size - bytes_sent;
                let chunk_size = Math.min(bytes_left, xfer_size);

                device.getStatus().then(poll_until_download_idle).then(
                    result => {
                        if (result.status != 0x0) {
                            throw "DFU DOWNLOAD failed state=${result.state}, status=${result.status}";
                        }
                        return Promise.resolve();
                    }
                ).then(
                    () => {
                        if (bytes_left > 0) {
                            return device.download(data.slice(bytes_sent, bytes_sent+chunk_size), transaction++).then(download_success);
                        } else {
                            device.logDebug("Sending empty block");
                            return device.download(new ArrayBuffer([]), transaction++).then(
                                () => resolve(bytes_sent),
                                error => reject(error)
                            );
                        }
                    }
                )
            }

            // Initialize progress to 0
            device.logProgress(bytes_sent, expected_size);

            device.download(data.slice(0, xfer_size), transaction++).then(download_success);
        });

        return downloadOperation.then(
            bytes_written => {
                device.logInfo("Wrote " + bytes_written + " bytes");
                // Transition to MANIFEST_SYNC state
                device.logInfo("Manifesting new firmware");
                device.getStatus().then(poll_until_dfu_idle).then(
                    result => {
                        if (result.status != 0x0) {
                            throw "DFU MANIFEST failed state=${result.state}, status=${result.status}";
                        }
                        return Promise.resolve();
                    }
                );
            }
        );
    };
    
})();
