# @bablr/cli

This is the CLI runner for BABLR. If you have a BABLR grammar for a computer language, this tool allows you to use it to do streaming parsing. Parse results are presented in CSTML.

## Usage

This package has no built-in language support, but rather expects you to supply a valid import specifier referring to a BABLR language. This likely means that you will likely need to start by installing both the parser and the language you wish to use.

```
Usage: bablr [options]

Options:
  -l, --language [URL]     The URL of the top BABLR language
  -p, --production [type]  The name of the top production type
  -F, --no-format          Produce machine-readable CSTML output
  -f, --format             Pretty-format CSTML output (default: true)
  -v, --verbose            Prints debugging information to stderr
  -c, --color              Color output using ANSI escapes (default: true)
  -C, --no-color           Do not color output
  -d, --detect-color       Allow color only if support is detected (default: true)
  -D, --no-detect-color    Allow color even if support is not detected
  -e, --embedded           Requires quoted input but enables gap parsing
  -h, --help               display help for command
```

## Example

```bash
bablr -l @bablr/language-json -p Expression -f << 'EOF'
[
  1,
  true,
  "3"
]
EOF
```

Running the above command produces the following output. Note that this is a stream parse so lines of output will appear one by one as fast as the input can be read and parsed.

```cstml
<!0:cstml bablr-language='https://github.com/bablr-lang/language-json'>
<>
  <Array>
    openToken:
    <~*Punctuator '[' balanced=']' />
    <#*Space:Space>
      '\n  '
    </>
    elements[]:
    <Number span='Number'>
      wholePart:
      <Integer>
        digits[]:
        <*Digit>
          '1'
        </>
      </>
      fractionalPart:
        null
      exponentPart:
        null
    </>
    separators[]:
    <~*Punctuator ',' />
    <#*Space:Space>
      '\n  '
    </>
    elements[]:
    <Boolean>
      sigilToken:
      <~*Keyword 'true' />
    </>
    separators[]:
    <~*Punctuator ',' />
    <#*Space:Space>
      '\n  '
    </>
    elements[]:
    <String>
      openToken:
      <~*Punctuator '"' balanced='"' balancedSpan='String' />
      content:
      <*StringContent>
        '3'
      </>
      closeToken:
      <~*Punctuator '"' balancer />
      <#*Space:Space>
        '\n'
      </>
    </>
    closeToken:
    <~*Punctuator ']' balancer />
    <#*Space:Space>
      '\n'
    </>
  </>
</>
```
