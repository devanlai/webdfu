# webdfu
This is a proof-of-concept demo of host [USB DFU](http://wiki.openmoko.org/wiki/USB_DFU) drivers in Javascript utilizing the [WebUSB](https://wicg.github.io/webusb/) draft standard to implement USB firmware updates from the browser.

The live, very rough demo can be accessed online:

https://devanlai.github.io/webdfu/dfu-util/

## Host-side implementation
WebUSB is only supported on the dev channel of Chromium / Google Chrome, and then only after enabling the experimental WebUSB flags. See https://github.com/webusb/arduino for additional details.

The DFU drivers are ported from the excellent open-source [dfu-util](http://dfu-util.sourceforge.net/) software.

## Device-side implementation
Adding WebUSB support requires responding to requests for custom WebUSB descriptors, but otherwise requires no changes to existing USB functionality.

An example WebUSB-enabled USB DFU bootloader for the STM32F103 can be found here:

https://github.com/devanlai/dapboot/tree/webusb

## Implemented features
* Reading the current device firmware (DFU upload)
* Writing new firmware to a device (DFU download)
* Switching from the runtime configuration to the DFU bootloader (DFU detach)

Currently, the DFU functional descriptors aren't (and possibly can't be) read via WebUSB, so the user is responsible for selecting the correct transfer size and identifying if the device is capable of upload/download.
