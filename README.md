# webdfu
This is a proof-of-concept demo of host [USB DFU](http://wiki.openmoko.org/wiki/USB_DFU) drivers in Javascript utilizing the [WebUSB](https://wicg.github.io/webusb/) draft standard to implement USB firmware updates from the browser.

## Demos
### dfu-util
A demo re-implementing dfu-util functionality in the browser:

https://devanlai.github.io/webdfu/dfu-util/

### mbed-download
A demo using WebUSB and the [mbed remote compilation API](https://developer.mbed.org/handbook/Compile-API) to build and flash boards in one step:

https://devanlai.github.io/webdfu/mbed-download/

## Host-side implementation
WebUSB is currently only supported by Chromium / Google Chrome.

For Chrome to communicate with a USB device, it must have permission to access the device and the operating system must be able to load a generic driver that libusb can talk to.

On Linux, that means that the current user must have permission to access the device.

On Windows, that means that an appropriate WinUSB/libusb driver must first be installed. This can be done manually with programs such as [Zadig](http://zadig.akeo.ie/) or automatically (sometimes...) with [WCID](https://github.com/pbatard/libwdi/wiki/WCID-Devices)

The javascript DFU driver is ported from the excellent open-source software, [dfu-util](http://dfu-util.sourceforge.net/).

## Device-side implementation
Adding WebUSB support requires responding to requests for custom WebUSB descriptors, but otherwise requires no changes to existing USB functionality.

An example WebUSB-enabled USB DFU bootloader for the STM32F103 can be found here:

https://github.com/devanlai/dapboot

For [mbed DAPLink](https://developer.mbed.org/handbook/DAPLink) firmware with WebUSB + DFU added, see this fork:

https://github.com/devanlai/DAPLink/tree/nucleo_webusb


## Implemented features
* Reading the current device firmware (DFU upload)
* Writing new firmware to a device (DFU download)
* Switching from the runtime configuration to the DFU bootloader (DFU detach)

## Local testing
To test changes locally, you can run a simple HTTPS server. A pre-generated certificate is included for convenience.

    python SimpleSecureHTTPServer.py --cert server.pem --port 8000

Note: Don't re-use this certificate outside of your development environment!

When running locally, the [origin trial token](https://github.com/jpchase/OriginTrials/blob/gh-pages/explainer.md) that enables WebUSB for this domain does not apply, so you must ensure that WebUSB is enabled by visiting chrome://flags and ensuring that the #enable-webusb and #enable-experimental-web-platform-features flags are enabled.

For additional tips and information about WebUSB, see this article:

https://developers.google.com/web/updates/2016/03/access-usb-devices-on-the-web#tips