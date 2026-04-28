# ff6-server

**Custom Server for Fast & Furious 6: The Game**

The current build of the server is 0.1.2.<br>
1.x.x, 2.x.x, and 3.x.x versions of the game are quite stable now. It's still quite experimental, but it's coming along quite well.<br>
Later versions of the game have some unimplemented server functionality that makes them not work very well.

This server is built with Node.js 10+ in mind (for now). Node.js versions 10 to 25 have been tested as working with no issues that I know of.<br>
I do not recommend exposing this server to the public web yet. It's not complete, and there is little to nothing implemented for security.

Data saving and loading was added in 0.0.3. It's still early, but it seems to be reliable.<br>
Data loss can occur. Please make backups of your save folder. And if an issue occurs, please report it.

You will need to patch the game file you plan on using with your local IP. The developer builds of the game have options to use local IPs.<br> 
You will also still need to replace the certificate in the game asset files with a local certificate if you want HTTPS.<br>
Retail builds can also be patched to use local IPs or a domain that points to a local IP, with Android builds being the easiest to do this with.<br>
If you need instructions on how to do this, they are provided in my Discord server in the pinned messages.<br>

This server was mainly tested on Android, with iOS being secondary. Android versions have better logging and are easier to modify.<br>
The game has built-in debug logs that don't go to logcat, but you can mod it to dump to logcat too, which was a lifesaver developing this.

## Versions tested are as such:

* **iOS Developer Build 0.1** – Great compatibility.

* **iOS Developer Build 0.2** – Great compatibility.

* **Android Retail Build 1.0.0** – Great compatibility.

* **Android Retail Build 1.0.4** – Great compatibility.

* **Android Retail Build 1.1.0** – Great compatibility.

* **Android Retail Build 2.0.0** – Great compatibility.

* **Android Retail Build 3.0.0** – Great compatibility. (Needs more testing due to lack of good OBB)

* **Android Retail Build 3.4.1** – Great compatibility.

* **Android Retail Build 3.4.2** – Great compatibility.

* **Android Retail Build 3.5.0** – Good compatibility.

* **Android Retail Build 3.5.2** – Good compatibility.

* **Android Retail Build 3.6.0** – Good compatibility.

* **Android Retail Build 4.0.3** – Good compatibility.

* **Android Retail Build 4.1.2** – Poor compatibility.

* **Windows 8.1/WinRT Retail Build 4.1.2** – Poor compatibility.

There are many more versions I haven't really tested much. But you pretty much can assume the newer the version, the worse it will function with this.

Feel free to leave a post in the issue section or message me in Discord if you have any questions or issues. And thanks for reading. :)

- **My Discord**: https://discord.gg/KMAq2mVaXp

Usage:

`node server.js`

Optional flags:

`--silent` for entirely silent startup

`--debuglog` to enable request logging

`--ssldebuglog` for ssl/tls logging

`--filedebuglog [FILE PATH HERE]` for logging to file

---

### Galaxy Note Edge on Android 4.4.4 and running game version 1.0.4:

![Screenshot\_2025-04-24-18-07-41](https://github.com/user-attachments/assets/0ba249e1-d40e-4205-a34c-647c996af012)
