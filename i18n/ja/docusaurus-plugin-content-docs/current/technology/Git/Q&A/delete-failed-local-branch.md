# How to delete local branch which is not exist in remote repository

## Problem Description
When use ```git branch -a``` or ```-r```, there's branch not actually exists in the remote repository. This is because ```git branch -a``` shows remote branches stored in local repository.

## Solution
Use ```git fetch —prune``` to prune local branch.
(Pull latest remote branch by ```git fetch```. add ```-prune``` option to prune local branch.)