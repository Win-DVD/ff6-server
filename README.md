# ff6-server
Custom Server for Fast &amp; Furious 6: The Game

This is incredibly incomplete and contains a LOT of guess work and placeholder data. It will make the older versions of the game function fairly okay (1.x.x versions) but the new 4.x.x versions function very poorly with this server, though will start.
I know a lot of the response data is very incorrect, but I have no actual live server data to reference, So most of these responses are made from looking at the game client code and guess work.
Mainly releasing this in this state due to the fact I haven't really been working on it at all.

This is built with Node.JS 11 in mind since TLS 1.0 support is ideal for older devices that don't support TLS 1.2 communcation. Do keep in mind the security risks that entails though.
Feel free to do whatever you want with this code, I may update this more in the future but it's not an active project for me.

There is no data saving at all, So any progress you make will be wiped on game restart.

You will need to patch the game file you plan on using with your local ip, the developer builds of the game have options to use local ips, but you will still probably need to replace the certificate in the game asset files with a local certificate.
Retail builds can also be patched to use local ips, or a domain that points to a local ip.

This server was mainly tested on iOS and Android. Android versions have better logging and are easier to modify. The game has built in debug logging that doesn't go to logcat, but you can modify it to dump to logcat too, which was a lifesaver developing this.

Versions tested are as such:

iOS Developer Build 0.1 - Decent compatibility.

iOS Developer Build 0.2 - Decent compatibility.

Android Retail Build 1.0.0 - Decent compatibility.

Android Retail Build 1.0.4 - Decent compatibility.

Android Retail Build 3.4.2 - Poor compatibility.

Android Retail Build 4.1.2 - Poor compatibility.

Windows 8.1/WinRT Retail Build 4.1.2 - Poor compatibility.

There are many more versions I haven't really tested much. But pretty much can assume the newer the version, the worse it will function with this.

Feel free to leave a post in the issue section if you have any questions or issues. And thanks for reading :)

Galaxy Note Edge on Android 4.4.4 and running game version 1.0.4:
![Screenshot_2025-04-24-18-07-41](https://github.com/user-attachments/assets/0ba249e1-d40e-4205-a34c-647c996af012)
