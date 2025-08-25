# Converting Built-in Render Pipeline to URP in Unity 6

This post walks through how I successfully converted a Unity 6 project using the **Built-in Render Pipeline** to the **Universal Render Pipeline (URP)**, based on real steps and options available in the Unity 6 Editor.

---

## ❓ What is Built-in and URP?

Unity provides multiple rendering pipelines. Here's a quick overview:

### 🔷 Built-in Render Pipeline (BRP)
- Unity’s legacy rendering system
- Easy to use but **limited in customization and modern rendering features**
- Not optimal for newer devices, platforms, or performance tuning
- Difficult to scale across platforms like mobile, VR, and console

### 🔶 Universal Render Pipeline (URP)
- Unity’s **modern, cross-platform** rendering pipeline
- Designed for **performance and flexibility**
- Supports **Shader Graph**, **Scriptable Renderer Features**, **Better mobile/VR optimization**
- Works consistently across **PC, mobile, console, WebGL**

---

## ✅ Environment

- **Unity version**: Unity 6
- **OS**: MacOS

---

## 🔧 Step-by-Step Conversion Guide

### 1. Install URP via Package Manager

- Open **Window → Package Manager**
- In the top left, select `Unity Registry`
- Search for **Universal RP**
- Click **Install**

> ✅ If installed correctly, `URP` components like `URP Asset`, `URP Renderer`, etc., will become available under `Create → Rendering`.

---

### 2. Create URP Asset

- Right-click in the **Project** panel → **Create → Rendering → URP Asset (with Universal Renderer)**
- Unity will generate:
  - `New URP Universal Render Pipeline.asset` (the main pipeline asset)
  - `New URP Universal Renderer.asset` (the associated renderer config)

---

### 3. Set URP Asset in Graphics Settings

- Go to **Edit → Project Settings → Graphics**
- In **Scriptable Render Pipeline Settings**, drag in the file:
  - `New URP Universal Render Pipeline.asset`

This officially switches your project from Built-in to URP.

---

### 4. Fix Pink Materials (Broken Standard Shaders)

#### Problem

After switching to URP, any materials using the **Built-in Standard Shader** will break and appear **pink**.

#### Solution

For each affected material:

- Open the material `.mat` file
- Change the shader from:
  ```
  Standard
  ```
  to:
  ```
  Universal Render Pipeline / Lit
  ```

If you have only a few materials (like I had, just 4), this is very fast to do manually.

---

## 🔄 Optional: Batch Convert All Materials

For large projects, use an Editor script like this to convert all Standard Shader materials:

```csharp
using UnityEngine;
using UnityEditor;

public class URPMaterialConverter
{
    [MenuItem("Tools/Convert Standard Shader to URP Lit")]
    static void ConvertStandardToURPLit()
    {
        string[] guids = AssetDatabase.FindAssets("t:Material");
        foreach (string guid in guids)
        {
            string path = AssetDatabase.GUIDToAssetPath(guid);
            Material mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat != null && mat.shader.name == "Standard")
            {
                mat.shader = Shader.Find("Universal Render Pipeline/Lit");
                Debug.Log($"✅ Converted: {mat.name}");
            }
        }
        AssetDatabase.SaveAssets();
        Debug.Log("🎉 All materials converted to URP/Lit.");
    }
}
```

Place this file in your `Assets/Editor/` folder.

---

## 🎉 Result

After following the above steps, my project was fully converted to URP, with all materials rendering correctly using the URP/Lit shader.

If you're migrating a legacy Unity project, this process is straightforward and works smoothly in Unity 6.