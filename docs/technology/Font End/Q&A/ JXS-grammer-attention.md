# Attentions when writing JXS

在React或JSX中，```style={{ width: "600px", height: "940px" }}```使用两层花括号是因为：

外层的花括号 { ... } 表示这是一个 JavaScript 表达式，而非普通的字符串。JSX语法允许你在大括号中插入 JavaScript 表达式，便于动态传值。
内层的花括号 { width: "600px", height: "940px" } 是一个 JavaScript 对象。style 属性需要接受一个对象形式，其中每个样式都是键值对，键为样式属性名，值为样式的值。例如，width: "600px" 表示宽度600px。
这也是为什么 JSX 中 style 的书写格式是两层花括号：外层用来包含 JavaScript 表达式，内层是实际的样式对象。


以下几点是特别要注意的：

- 样式属性名：在JSX中，CSS属性名需要使用驼峰命名法（如 backgroundColor 而不是 background-color）。
- 字符串值：CSS属性的值必须是字符串，如 "#ff7fff"。
- 百分比值：像 fontSize: "108%" 这样的值也必须用引号包裹。

```
<span style = "
    background-color = #d3d3d3; 
    font-weight = bold; 
    font-size = 108%;
">
テゴリーⅠ飛行
</span> 
```
```
<span style = {{
    backgroundColor: "#d3d3d3", 
    fontWeight: "bold", 
    fontSize: "108%",
}}>
テゴリーⅠ飛行
</span> 
```

> ## Reference
> https://zenn.dev/joker/articles/bf8648cded2fc7
> https://ufirst.jp/memo/2021/09/reactでエラー「error-the-style-prop-expects-a-mapping-from-style-properties-to-values-not-a-string」/#google_vignette
