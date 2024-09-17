# Icons repeated in Launchpad 

## Problem Description:
Some icons in Launchpad are repeated, but it's normal in floder Applications.

## Solution:
Reset Dock of LaunchPad. Execute command below in Terminal:  
`defaults write com.apple.dock ResetLaunchPad -bool true; killall Dock`