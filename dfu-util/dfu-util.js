var device;
(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', event => {
        let connectButton = document.querySelector("#connect");
        let scanButton = document.querySelector("#scan");
        let statusDisplay = document.querySelector("#status");
        let infoDisplay = document.querySelector("#usbInfo");
        let dfuDisplay = document.querySelector("#dfuInfo");
        let vidField = document.querySelector("#vid");
        let vid = parseInt(vidField.value, 16);
        //let device;

        function connect(device) {
            device.open().then(() => {
                statusDisplay.textContent = '';
                connectButton.textContent = 'Disconnect';
                infoDisplay.textContent = (
                    "MFG: " + device.device_.manufacturerName + "\n" +
                    "Name: " + device.device_.productName + "\n" +
                    "Serial: " + device.device_.serialNumber + "\n" +
                    "Class: 0x" + device.device_.deviceClass.toString(16) + "\n" +
                    "Subclass: 0x" + device.device_.deviceSubclass.toString(16) + "\n" +
                        "Protocol: 0x" + device.device_.deviceProtocol.toString(16) + "\n");

                dfuDisplay.textContent = "";
            }, error => {
                statusDisplay.textContent = error;
            });
            
        }

        vidField.addEventListener("change", function() {
            vid = parseInt(vidField.value, 16);
        });

        connectButton.addEventListener('click', function() {
            if (device) {
                device.close();
                connectButton.textContent = 'Connect';
                statusDisplay.textContent = '';
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

        scanButton.addEventListener('click', function() {
            dfuDisplay.textContent = "";
            function hex4(n) {
                let s = n.toString(16)
                while (s.length < 4) {
                    s = '0' + s;
                }
                return s;
            }
            dfu.findAllDfuInterfaces().then(
                devices => {
                    for (let device of devices) {
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
                        dfuDisplay.textContent += info + "\n";
                    }
                }
            );
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
