# Why don't have to upload ```node modeles``` folder to remote repositories?

When uploading local working respositories to remote repositories like Github, ```package-lock.json``` in root folder declares dependencies need to be downloaded by deploying system. So there's no necessary to upload local dependencies, while ```node modeles``` folder is often very big.

```package-lock.json``` is automatically generated when running ```npm install```. If there's no ```package-locak.json``` file in root foler of project, or there're updates in dependencies, npm will automatically generate or update the file.
