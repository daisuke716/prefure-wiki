# How to delete local branch which is not exist in remote repository

## Problem Description
使用git branch -a或者-r时发现有在远程仓库中实际不存在的branch，因为git branch -a 显示本地存储库中存在的远程分支。
需要通过git fetch拉取最新的远程branch，添加—prune选项修剪本地branch。即输入git fetch —prune即可解决。

## Solution
Use ```git fetch —prune``` to prune local branch.
(Pull latest remote branch by ```git fetdch```. add ```-prune``` option to prune local branch.)