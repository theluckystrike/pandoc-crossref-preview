# Reference text that stays literal

The reference @fig:sample is a clickable number in this paragraph.

![Sample cell](cell.svg){#fig:sample}

## Code and links

Inline code: `@fig:sample`.

```markdown
@fig:sample
![Example](example.png){#fig:example}
```

[Link text @fig:sample](https://example.test/@fig:sample)

https://example.test/@fig:sample

The plugin leaves code, links and URL text unchanged. The note bytes stay unchanged when Reading view opens.
