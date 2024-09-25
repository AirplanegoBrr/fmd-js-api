# @airplanegobrr/fmd-js-api

This is an API for the [FMD Server](https://gitlab.com/Nulide/findmydeviceserver) (Version 0.5.0)

Android app: [FMD App](https://gitlab.com/Nulide/findmydevice)

I've been working on this project on and off for around 3+++ months.

Yeah I know, I am really bad with cryptography so thats why it took so long.

This uses the `Modern` encrytion, the API is based off the scripts found in [FMD Server Web](https://gitlab.com/Nulide/findmydeviceserver/-/tree/master/web?ref_type=heads) and looking at the network logs

This uses `axios`, `argon2` (Making sure to set `argon2.limits.timeCost.min` to `1`, no clue what that means) and `@peculiar/webcrypto`

This also has [JsDocs](fmd-api.js#L6) so [IntelliSense](https://code.visualstudio.com/docs/editor/intellisense) works!

If you like this project please make sure to :star: (star) it, it would mean alot to me :D

PR's and Issues are welcome!

# How to use

```js
const FMD_API = require("@airplanegobrr/fmd-js-api")

let fmdAPI = new FMD_API("<deviceID>", "<password>", {
    url: "https://fmd.nulide.de:1008/" // Defaults to https://fmd.nulide.de:1008/ if none is supplied
})

fmdAPI.login().then(async (data)=>{
    // Data has an object with accessToken and privateKey, You really dont need to use these but it's nice to have incase

    await fmdAPI.commands.locate() // Tells the device to send its current location to the server, might take awhile for the device to send its loction back to the server.

    let location = fmdAPI.locate(-1) // Gets the lastest location, keep in mind this will NOT ask for the device for its current location, it asks the server what the last location the device sent to the server!
    console.log(location)

    // fmdAPI.commands also has some commands like:
    // locate
    // locate_gps
    // locate_cell
    // locate_last
    // ring
    // lock
    // camera_front
    // camera_back

    let picCount = await fmdAPI.getPictureCount() // Get ammount of pictures the server has
    let picBuffer = await fmdAPI.getPicture(picCount) // Takes the picture index (biggest number == lastest)
    console.log(picCount, picBuffer)
})
```

# FAQ

- Q: How do I get a list of devices the server has?
- A: You can't, that would be a **big** security risk, it would be nice if it were available for private server but its not
- Q: How do I delete my device?
- A: This is a big risk, I didn't add it as again its a risk- if you want to do it do `fmdAPI.sendToPhone("delete <pin>")`, this will **NOT** be added to the commands object- too risky

## Note:

I HATE CRYPTO, I HATE CRYPTO, I HATE CRYPTO, I HATE CRYPTO, I HATE CRYPTO, I HATE CRYPTO!!!