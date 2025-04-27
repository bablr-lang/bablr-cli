# @bablr/cli

This is the CLI runner for BABLR. If you have a BABLR grammar for a computer language, this tool allows you to use it to do streaming parsing. Parse results are presented in CSTML.

For complete information see the [bablr-cli reference documentation](https://docs.bablr.org/reference/bablr-cli)

## Usage

```bash
bablr -l @bablr/language-en-json -p Expression -f << 'EOF'
[
  1,
  true,
  "3"
]
EOF
```
