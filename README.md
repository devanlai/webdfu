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
The current WebUSB draft no longer requires the device to support additional WebUSB descriptors.
However, implementing WebUSB descriptors allows the device to specify a landing page URL for the browser to present to the user when the device is plugged in.

For an example WebUSB-enabled USB DFU bootloader for the STM32F103 series, check out the [dapboot](https://github.com/devanlai/dapboot) project

## Implemented features
* Reading the current device firmware (DFU upload)
* Writing new firmware to a device (DFU download)
* Switching from the runtime configuration to the DFU bootloader (DFU detach)
* ST DfuSe download
* ST DfuSe upload

## Planned future features:
* DfuSe file format support
* DFU file suffix support
* Better support for remembering previous DFU configurations and pairing the bootloader/runtime versions of the same device.

## Local testing
To test changes locally, you can run a simple web server.

For testing purposes, your browser will treat even an HTTP server as a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts#when_is_a_context_considered_secure) that can access WebUSB if it is accessed from localhost.

To this end, you can use the standard Python one-liner for running a local HTTP server.

For Python 2:

    python -m SimpleHTTPServer

For Python 3:

    python3 -m http.server

If you do want to test over HTTPS for development, you can run a toy HTTPS server with the following command. A pre-generated certificate is included for convenience.

    python SimpleSecureHTTPServer.py --cert server.pem --port 8000

Note: Don't re-use this certificate outside of your development environment!

For additional tips and information about WebUSB, see this article:

https://web.dev/usb/
