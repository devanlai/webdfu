var device;
var foo;
var configurator;
(function() {
    'use strict';

    function hex4(n) {
        let s = n.toString(16)
        while (s.length < 4) {
            s = '0' + s;
        }
        return s;
    }

    function formatDFUSummary(device) {
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

    function getDFUDescriptorProperties(device) {
        // Attempt to read the DFU functional descriptor
        // TODO: read the selected configuration's descriptor
        return device.readConfigurationDescriptor(0).then(
            data => {
                let configDesc = dfu.parseConfigurationDescriptor(data);
                let funcDesc = null;
                let configValue = device.settings.configuration.configurationValue;
                if (configDesc.bConfigurationValue == configValue) {
                    for (let desc of configDesc.descriptors) {
                        if (desc.bDescriptorType == 0x21 && desc.hasOwnProperty("bcdDFUVersion")) {
                            funcDesc = desc;
                            break;
                        }
                    }
                }

                if (funcDesc) {
                    return {
                        WillDetach:            ((funcDesc.bmAttributes & 0x08) != 0),
                        ManifestationTolerant: ((funcDesc.bmAttributes & 0x04) != 0),
                        CanUpload:             ((funcDesc.bmAttributes & 0x02) != 0),
                        CanDnload:             ((funcDesc.bmAttributes & 0x01) != 0),
                        TransferSize:          funcDesc.wTransferSize,
                        DetachTimeOut:         funcDesc.wDetachTimeOut,
                        DFUVersion:            funcDesc.bcdDFUVersion
                    };
                } else {
                    return {};
                }
            },
            error => {}
        );
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
            logContext.scrollTop = logContext.scrollHeight;
        }
    }

    function logWarning(msg) {
        if (logContext) {
            let warning = document.createElement("p");
            warning.className = "warning";
            warning.textContent = msg;
            logContext.appendChild(warning);
            logContext.scrollTop = logContext.scrollHeight;
        }
    }

    function logError(msg) {
        if (logContext) {
            let error = document.createElement("p");
            error.className = "error";
            error.textContent = msg;
            logContext.appendChild(error);
            logContext.scrollTop = logContext.scrollHeight;
        }
    }

    function logProgress(done, total) {
        if (logContext) {
            let progressBar = logContext.querySelector("progress");
            if (!progressBar) {
                progressBar = document.createElement("progress");
                logContext.appendChild(progressBar);
                logContext.scrollTop = logContext.scrollHeight;
            }
            progressBar.value = done;
            if (typeof total !== 'undefined') {
                progressBar.max = total;
            }
        }
    }

    function getVidFromQueryString(queryString) {
        let results = /[&?]vid=(0x[0-9a-fA-F]{1,4})/.exec(queryString);
        if (results) {
            return results[1];
        } else {
            return "";
        }
    }

    function displayBinarySummary(context, metadata) {
        context.textContent = `${metadata.binary} (${metadata.link_totals.code}B)`;
    }

    document.addEventListener('DOMContentLoaded', event => {
        let connectButton = document.querySelector("#connect");
        let detachButton = document.querySelector("#detach");
        let downloadButton = document.querySelector("#download");
        let statusDisplay = document.querySelector("#status");
        let infoDisplay = document.querySelector("#usbInfo");
        let dfuDisplay = document.querySelector("#dfuInfo");
        let binDisplay = document.querySelector("#binaryInfo");
        let vidField = document.querySelector("#vid");
        let vidFromUrl = getVidFromQueryString(window.location.search);
        if (vidFromUrl) {
            vidField.value = vidFromUrl;
        }
        
        let vid = parseInt(vidField.value, 16);
        let transferSizeField = document.querySelector("#transferSize");
        let transferSize = parseInt(transferSizeField.value);
        let firmwareFile = null;
        let firmwareFilename = null;

        let downloadLog = document.querySelector("#downloadLog");
        let mbedLog = document.querySelector("#mbedLog");
        let authnButton = document.querySelector("#authenticate");
        let buildButton = document.querySelector("#build");
        let saveButton = document.querySelector("#save");
        let progButton = document.querySelector("#buildAndProgram");

        let manifestationTolerant = true;

        //let device;

        function logMbedMessage(msg) {
            var info;
            if (typeof configurator.uuid !== "undefined" && configurator.uuid == msg) {
                info = document.createElement("p");
                info.className = "info";
                info.textContent = "Task UUID: " + msg;
            } else {
                info = document.createElement("p");
                info.className = "info";
                info.textContent = msg;
            }

            mbedLog.appendChild(info);
            mbedLog.scrollTop = mbedLog.scrollHeight;
        };

        configurator = new mbedCompileApi(logMbedMessage);

        function onDisconnect(reason) {
            if (reason) {
                statusDisplay.textContent = reason;
            }

            connectButton.textContent = "Connect";
            infoDisplay.textContent = "";
            dfuDisplay.textContent = "";
            detachButton.disabled = true;
            downloadButton.disabled = true;
            progButton.disabled = true;
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

                // Display basic dfu-util style info
                dfuDisplay.textContent = formatDFUSummary(device);

                // Update buttons based on capabilities
                if (device.settings.alternate.interfaceProtocol == 0x01) {
                    // Runtime
                    detachButton.disabled = false;
                    downloadButton.disabled = true;
                } else {
                    // DFU
                    detachButton.disabled = true;
                    if (firmwareFile != null) {
                        downloadButton.disabled = false;
                    }
                    if (!buildButton.disabled) {
                        progButton.disabled = false;
                    }
                }

                // Attempt to parse the DFU functional descriptor
                getDFUDescriptorProperties(device).then(
                    desc => {
                        if (desc && Object.keys(desc).length > 0) {
                            let info = `WillDetach=${desc.WillDetach}, ManifestationTolerant=${desc.ManifestationTolerant}, CanUpload=${desc.CanUpload}, CanDnload=${desc.CanDnload}, TransferSize=${desc.TransferSize}, DetachTimeOut=${desc.DetachTimeOut}, Version=${hex4(desc.DFUVersion)}`;
                            dfuDisplay.textContent += "\n" + info;
                            transferSizeField.value = desc.TransferSize;
                            if (desc.CanDnload) {
                                manifestationTolerant = desc.ManifestationTolerant;
                            }

                            if (device.settings.alternate.interfaceProtocol == 0x02) {
                                if (!desc.CanDnload) {
                                    dnloadButton.disabled = true;
                                }
                            }
                        }
                    }
                );
            }, error => {
                onDisconnect(error);
            });
        }

        function autoConnect() {
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
                device.detach().then(
                    len => {
                        device.close();
                        onDisconnect();
                        device = null;
                        // Wait a few seconds and try reconnecting
                        setTimeout(autoConnect, 5000);
                    },
                    error => {
                        device.close();
                        onDisconnect(error);
                        device = null;
                    }
                );
            }
        });

        downloadButton.addEventListener('click', function() {
            if (device && firmwareFile != null) {
                setLogContext(downloadLog);
                clearLog(downloadLog);
                device.do_download(transferSize, firmwareFile, manifestationTolerant).then(
                    () => {
                        logInfo("Done!");
                        setLogContext(null);
                    }
                )
            }
        });

        authnButton.addEventListener('click', function() {
            let usernameField = document.querySelector("#username");
            let passwordField = document.querySelector("#password");
            configurator.setCredentials(usernameField.value, passwordField.value);
            buildButton.disabled = false;
            if (device && device.settings.alternate.interfaceProtocol != 0x01) {
                progButton.disabled = false;
            }
            return false;
        });

        function buildAndDownloadFirmware() {
            return new Promise(function(resolve, reject) {
                let buildForm = document.querySelector("#buildForm")

                let target = buildForm.elements["targetPlatform"].value;
                let symbols = {};
                
                let buildPromise;
                if (buildForm.elements["buildType"].value == "program") {
                    let program = buildForm.elements["programName"].value;
                    buildPromise = configurator.buildProgramAsPromise(symbols, program, target);
                } else {
                    let repo = buildForm.elements["repoURL"].value
                    buildPromise = configurator.buildRepoAsPromise(symbols, repo, target);
                }

                buildPromise.then(
                    result => {
                        let reader = new FileReader();
                        reader.onload = function() {
                            let readResult = {
                                "metadata": result.metadata,
                                "data": reader.result
                            };
                            resolve(readResult);
                        };
                        reader.readAsArrayBuffer(result.blob);
                    },
                    err => {
                        reject(err);
                    }
                )
            });
        }

        buildButton.addEventListener('click', function() {
            clearLog(mbedLog);

            saveButton.disabled = true;
            firmwareFile = null;
            firmwareFilename = null;

            buildAndDownloadFirmware().then(
                result => {
                    logMbedMessage("Retrieved firmware from server");
                    firmwareFile = result.data;
                    if (firmwareFile != null && device &&
                        (device.settings.alternate.interfaceProtocol != 0x01)) {
                        downloadButton.disabled = false;
                        saveButton.disabled = false;
                    }
                    firmwareFilename = result.metadata.binary;
                    displayBinarySummary(binDisplay, result.metadata);
                },
                err => {
                    logMbedMessage(err);
                }
            );

            return false;
        });

        saveButton.addEventListener('click', function() {
            if (firmwareFile) {
                let blob = new Blob([firmwareFile]);
                if (!firmwareFilename) {
                    firmwareFilename = "firmware.bin";
                }
                saveAs(blob, firmwareFilename);
            }
            return false;
        });

        progButton.addEventListener('click', function() {
            clearLog(mbedLog);

            saveButton.disabled = true;
            firmwareFile = null;
            firmwareFilename = null;

            buildAndDownloadFirmware().then(
                result => {
                    logMbedMessage("Retrieved firmware from server");
                    firmwareFile = result.data;
                    if (firmwareFile != null && device &&
                        (device.settings.alternate.interfaceProtocol != 0x01)) {
                        downloadButton.disabled = false;
                        saveButton.disabled = false;

                        // Try flashing the target
                        setLogContext(mbedLog);
                        device.do_download(transferSize, firmwareFile, manifestationTolerant).then(
                            () => {
                                logInfo("Done!");
                                setLogContext(null);
                            },
                            error => {
                                logError(error);
                                setLogContext(null);
                            }
                        )
                    }
                    firmwareFilename = result.metadata.binary;
                    displayBinarySummary(binDisplay, result.metadata);
                },
                err => {
                    logMbedMessage(err);
                }
            );

            return false;
        });

        // Check if WebUSB is available
        if (typeof navigator.usb !== 'undefined') {
            // Try connecting automatically
            autoConnect();
        } else {
            statusDisplay.textContent = 'WebUSB not available.'
            connectButton.disabled = true;
        }
    });
})();
