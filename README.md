# AutoVent ABVM Updater
This is a proof-of-concept demo of host [USB DFU](http://wiki.openmoko.org/wiki/USB_DFU) drivers in Javascript utilizing the [WebUSB](https://wicg.github.io/webusb/) draft standard to implement USB firmware updates from the browser.

## Usage

Navigate to https://autovent.github.io/update/

## Details

### Host-side implementation
WebUSB is currently only supported by Chromium / Google Chrome.

For Chrome to communicate with a USB device, it must have permission to access the device and the operating system must be able to load a generic driver that libusb can talk to.

On Linux, that means that the current user must have permission to access the device.

On Windows, that means that an appropriate WinUSB/libusb driver must first be installed. This can be done manually with programs such as [Zadig](http://zadig.akeo.ie/) or automatically (sometimes...) with [WCID](https://github.com/pbatard/libwdi/wiki/WCID-Devices)

The javascript DFU driver is ported from the excellent open-source software, [dfu-util](http://dfu-util.sourceforge.net/).

Tested on Windows, OSX and android.

### Device-side implementation

- Tested with the STM32F303 built-in bootloader

## Implemented features
* Reading the current device firmware (DFU upload)
* Writing new firmware to a device (DFU download)
* Switching from the runtime configuration to the DFU bootloader (DFU detach)
* ST DfuSe download
* ST DfuSe upload

## Local testing
To test changes locally, you can run a simple HTTPS server. A pre-generated certificate is included for convenience.

```
    python3 -m http.server
    ```