# How to set default branch name created by 'git intit'
| Command | Description |
|-----|----|
|```git remote set-head origin -a```    |    point origin/HEAD to default branch of remote repository（-a is --auto）|
|```git remote set-head origin dev```  |     point origin/HEAD to （origin/dev）  |
|```git remote set-head origin -d```   |     delete origin/HEAD    |

:::tip
HEAD always points to last committed repository，so it will automatically change.
:::