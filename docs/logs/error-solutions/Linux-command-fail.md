# Linux command fail
## Problem Description:
Command in Centos undefined after I updated environment variable. Including install command like `vim`，`vi`，`ls`，`ll`，`sudo`，`systemctl`.
## Solution:
1. Use command below can fix the problem temporary, but export command only valid on current ssh link. It breaks after close the window.  
`export PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin:/root/bin`
2. Edit or delete the wrong config added in  `/etc/profile` by `vim /etc/profile`
or edit file `~/.bash_profile` by `vim ~/.bash_profile`
3. Activate the config by execute `source /etc/profile ` or  `source ~/.bash_profile`