# Keeping a Remote Task Running After SSH Disconnects

When you run a long task over SSH, it often stops as soon as the SSH session is disconnected. This is a common problem when downloading large files, training models, or running other long tasks on a remote server or NAS.

In my case, I was running the following command on a remote machine:

```bash
python main.py --download -id 2060000935
```

The problem is that if the SSH connection closes, the task may also terminate with it. To keep the task running in the background even after the session ends, I used `nohup` together with output redirection and background execution.

## Why this happens

An SSH session usually owns the shell that starts the process. If the session disconnects, the shell may send a hangup signal to the running program, which can stop the task.

To avoid that, we can use:

- `nohup` to ignore the hangup signal
- `>` and `2>&1` to save output into a log file
- `&` to put the process in the background

## Command to keep the task running

I changed the original command:

```bash
python main.py --download -id 2060000935
```

into this:

```bash
nohup python main.py --download -id 2060000935 > download.log 2>&1 &
```

After running it, the shell returned something like:

```bash
[1] 700636
```

Here:

- `[1]` is the background job number in the current shell
- `700636` is the process ID, or PID

That means the Python task has been started in the background.

## How to check the download progress

To monitor the program output in real time, use:

```bash
tail -f download.log
```

This follows the log file continuously and lets you see the latest output as the download proceeds.

## How to confirm the process is still running

To verify that the process is still active, use the PID returned by the shell:

```bash
ps -p 700636 -f
```

This shows detailed information for that process.

You can also search for the script directly:

```bash
ps aux | grep main.py
```

## Typical workflow

A practical workflow looks like this:

1. Start the task in the background:

```bash
nohup python main.py --download -id 2060000935 > download.log 2>&1 &
```

2. Note the returned PID, for example:

```bash
[1] 700636
```

3. Watch the log output:

```bash
tail -f download.log
```

4. Confirm the process is still running:

```bash
ps -p 700636 -f
```

5. Exit SSH safely:

```bash
exit
```

The task should continue running in the background even after the SSH session ends.
