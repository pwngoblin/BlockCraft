---
title: Sandbox mixed blocks
tags: [test, blockcraft]
---

# Heading one

A plain paragraph with **bold**, *italic*, and a [[wikilink]].
It continues on a second line (same block).


## Heading two

```ts
const a = 1;

// blank line inside fence must not split the block
console.log(a);
```

- item one
- item two
  - nested a
  - nested b
    - deeper
- item three

1. first
2. second

- [ ] todo open
- [x] todo done


~~~
tilde fence
~~~

| Col A | Col B |
| ----- | ----- |
| 1     | 2     |
| 3     | 4     |

> plain quote
> second quote line


> [!card] Card title
> card body
>
> > [!tip] Nested callout
> > nested body

> [!note] A callout
> body line 1
> body line 2

> [!columns]
> > [!card] Left
> > left body
>
> > [!card] Right
> > right body

$$
E = mc^2
$$

Inline math $a^2 + b^2 = c^2$ in a paragraph.

![[Welcome]]

---

Final paragraph with a footnote.[^1]

[^1]: The footnote text.

^block-id-test




