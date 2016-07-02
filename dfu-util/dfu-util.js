var device;
(function() {
    'use strict';

    function formatDFUSummary(device) {
        function hex4(n) {
            let s = n.toString(16)
            while (s.length < 4) {
                s = '0' + s;
            }
            return s;
        }

        const vid = hex4(device.device_.vendorId);
        const pid = hex4(device.device_.productId);
        const name = device.device_.productName;
        
        let mode = "Unknown"
        if (device.settings.alternate.interfaceProtocol == 0x01) {
            mode = "Runtime";
        } else if (device.settings.alternate.interfaceProtocol == 0x02) {
            mode = "DFU";
        }

        const cfg = device.settings.configuration.configurationValue;
        const intf = device.settings["interface"].interfaceNumber;
        const alt = device.settings.alternate.alternateSetting;
        const serial = device.device_.serialNumber;
        let info = `Found ${mode}: [${vid}:${pid}] cfg=${cfg}, intf=${intf}, alt=${alt}, name="${name}" serial="${serial}"`;
        return info;
    }

    // Current log div element to append to
    let logContext = null;

    function setLogContext(div) {
        logContext = div;
    };

    function clearLog(context) {
        if (typeof context === 'undefined') {
            context = logContext;
        }
        if (context) {
            context.innerHTML = "";
        }
    }

    function logDebug(msg) {
        console.log(msg);
    }

    function logInfo(msg) {
        if (logContext) {
            let info = document.createElement("p");
            info.className = "info";
            info.textContent = msg;
            logContext.appendChild(info);
        }
    }

    function logWarning(msg) {
        if (logContext) {
            let warning = document.createElement("p");
            warning.className = "warning";
            warning.textContent = msg;
            logContext.appendChild(warning);
        }
    }

    function logError(msg) {
        if (logContext) {
            let error = document.createElement("p");
            error.className = "error";
            error.textContent = msg;
            logContext.appendChild(error);
        }
    }

    function logProgress(done, total) {
        if (logContext) {
            let progressBar = logContext.querySelector("progress");
            if (!progressBar) {
                progressBar = document.createElement("progress");
                logContext.appendChild(progressBar);
            }
            progressBar.value = done;
            if (typeof total !== 'undefined') {
                progressBar.max = total;
            }
        }
    }

    document.addEventListener('DOMContentLoaded', event => {
        let connectButton = document.querySelector("#connect");
        let detachButton = document.querySelector("#detach");
        let downloadButton = document.querySelector("#download");
        let uploadButton = document.querySelector("#upload");
        let statusDisplay = document.querySelector("#status");
        let infoDisplay = document.querySelector("#usbInfo");
        let dfuDisplay = document.querySelector("#dfuInfo");
        let vidField = document.querySelector("#vid");
        let vid = parseInt(vidField.value, 16);
        let transferSizeField = document.querySelector("#transferSize");
        let transferSize = parseInt(transferSizeField.value);
        let firmwareFileField = document.querySelector("#firmwareFile");
        let firmwareFile = null;

        let downloadLog = document.querySelector("#downloadLog");
        let uploadLog = document.querySelector("#uploadLog");

        //let device;

        function onDisconnect(reason) {
            if (reason) {
                statusDisplay.textContent = reason;
            }

            connectButton.textContent = "Connect";
            infoDisplay.textContent = "";
            dfuDisplay.textContent = "";
            detachButton.disabled = true;
            uploadButton.disabled = true;
            downloadButton.disabled = true;
            firmwareFileField.disabled = true;
        }

        function connect(device) {
            device.open().then(() => {
                // Bind logging methods
                device.logDebug = logDebug;
                device.logInfo = logInfo;
                device.logWarning = logWarning;
                device.logError = logError;
                device.logProgress = logProgress;

                // Display basic USB information
                statusDisplay.textContent = '';
                connectButton.textContent = 'Disconnect';
                infoDisplay.textContent = (
                    "MFG: " + device.device_.manufacturerName + "\n" +
                    "Name: " + device.device_.productName + "\n" +
                    "Serial: " + device.device_.serialNumber + "\n" +
                    "Class: 0x" + device.device_.deviceClass.toString(16) + "\n" +
                    "Subclass: 0x" + device.device_.deviceSubclass.toString(16) + "\n" +
                        "Protocol: 0x" + device.device_.deviceProtocol.toString(16) + "\n");

                dfuDisplay.textContent = formatDFUSummary(device);

                // Update buttons based on capabilities
                if (device.settings.alternate.interfaceProtocol == 0x01) {
                    // Runtime
                    detachButton.disabled = false;
                    uploadButton.disabled = true;
                    downloadButton.disabled = true;
                    firmwareFileField.disabled = true;
                } else {
                    // DFU
                    // TODO: discover capabilities by reading descriptor
                    detachButton.disabled = true;
                    uploadButton.disabled = false;
                    downloadButton.disabled = false;
                    firmwareFileField.disabled = false;
                }
            }, error => {
                onDisconnect(error);
            });
            
        }

        vidField.addEventListener("change", function() {
            vid = parseInt(vidField.value, 16);
        });

        transferSizeField.addEventListener("change", function() {
            transferSize = parseInt(transferSizeField.value);
        });

        connectButton.addEventListener('click', function() {
            if (device) {
                device.close();
                onDisconnect();
                device = null;
            } else {
                let filters = [
                    { 'vendorId': vid }
                ];
                navigator.usb.requestDevice({ 'filters': filters }).then(
                    selectedDevice => {
                        let interfaces = dfu.findDeviceDfuInterfaces(selectedDevice);
                        device = new dfu.Device(selectedDevice, interfaces[0]);
                        connect(device);
                    }
                ).catch(error => {
                    statusDisplay.textContent = error;
                });
            }
        });

        detachButton.addEventListener('click', function() {
            if (device) {
                device.detach();
            }
        });
        
        uploadButton.addEventListener('click', function() {
            if (!device || !device.device_.opened) {
                onDisconnect();
                device = null;
            } else {
                setLogContext(uploadLog);
                clearLog(uploadLog);
                device.do_upload(transferSize).then(
                    blob => {
                        saveAs(blob, "firmware.bin");
                        setLogContext(null);
                    },
                    error => {
                        logError(error);
                        setLogContext(null);
                    }
                );
            }
        });

        firmwareFileField.addEventListener("change", function() {
            firmwareFile = null;
            if (firmwareFileField.files.length > 0) {
                let file = firmwareFileField.files[0];
                let reader = new FileReader();
                reader.onload = function() {
                    firmwareFile = reader.result;
                };
                reader.readAsArrayBuffer(file);
            }
        });

        downloadButton.addEventListener('click', function() {
            if (device && firmwareFile != null) {
                setLogContext(downloadLog);
                clearLog(downloadLog);
                device.do_download(transferSize, firmwareFile).then(
                    (bytes_written) => {
                        logInfo("Wrote " + bytes_written + " bytes");
                        setLogContext(null);
                    }
                )
            }
        });

        dfu.findAllDfuInterfaces().then(
            devices => {
                if (devices.length == 0) {
                    statusDisplay.textContent = 'No device found.';
                } else {
                    statusDisplay.textContent = 'Connecting...';
                    device = devices[0];
                    console.log(device);
                    connect(device);
                }
            }
        );
    });
})();
