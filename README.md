# ff6-server

**Custom Server for Fast & Furious 6: The Game**

> **IMPORTANT: This will not work out of the box with node.js 24+, The cypher for the localhost certificate is too weak for node.js to allow startup. You need to use node.js 22.x.x LTS or older. Or alternatively remake the certificate with a stronger cypher.**

This server is now much more complete as of 0.0.3, It can now save and load data reliably, and that fixes a lot of the issues.<br>
1.x.x and 2.x.x versions of the game are quite stable now. It's still quite experimental, but it's coming along quite well.<br>
Later versions of the game have some unimplemented server functionality that makes them not work very well.

This is built with Node.JS 11 in mind since TLS 1.0 support is ideal for older devices that don't support TLS 1.2 communcation. Do keep in mind the security risks that entails though.

Data saving and loading is added as of 0.0.3, It's still early, but it seems to be reliable.<br>
It's single player only still though. Data loss can occur, please make backups of your save folder. And if an issue occurs, please report it.

You will need to patch the game file you plan on using with your local IP, the developer builds of the game have options to use local IPs.<br> 
You will also still need to replace the certificate in the game asset files with a local certificate if you want HTTPS.<br>
Retail builds can also be patched to use local ips or a domain that points to a local IP, with Android builds being the easiest to do this with.<br>
If you need instructions on how to do this, they are provided in my discord server in the pinned messages.<br>

This server was mainly tested on iOS and Android. Android versions have better logging and are easier to modify.<br>
The game has built in debug logs that don't go to logcat, but you can mod it to dump to logcat too, which was a lifesaver developing this.

## Versions tested are as such:

* **iOS Developer Build 0.1** – Great compatibility.

* **iOS Developer Build 0.2** – Great compatibility.

* **Android Retail Build 1.0.0** – Great compatibility.

* **Android Retail Build 1.0.4** – Great compatibility.

* **Android Retail Build 1.1.0** – Great compatibility.

* **Android Retail Build 2.0.0** – Okay compatibility.

* **Android Retail Build 4.1.2** – Poor compatibility.

* **Windows 8.1/WinRT Retail Build 4.1.2** – Poor compatibility.

There are many more versions I haven't really tested much. But pretty much can assume the newer the version, the worse it will function with this.

Feel free to leave a post in the issue section or message me in Discord if you have any questions or issues. And thanks for reading :)

- **My Discord**: https://discord.gg/KMAq2mVaXp

---

### Galaxy Note Edge on Android 4.4.4 and running game version 1.0.4:

![Screenshot\_2025-04-24-18-07-41](https://github.com/user-attachments/assets/0ba249e1-d40e-4205-a34c-647c996af012)
