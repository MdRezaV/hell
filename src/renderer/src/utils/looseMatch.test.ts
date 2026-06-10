import { describe, expect, it } from 'vitest'
import { findLooseMatch, tokenize } from './looseMatch'

describe('tokenize', () => {
  it('should tokenize identifiers', () => {
    const result = tokenize('foo bar _baz')
    expect(result.tokens).toHaveLength(3)
    expect(result.tokens[0]).toEqual({
      kind: 'identifier',
      value: 'foo',
      start: 0,
      end: 3
    })
    expect(result.tokens[1]).toEqual({
      kind: 'identifier',
      value: 'bar',
      start: 4,
      end: 7
    })
    expect(result.tokens[2]).toEqual({
      kind: 'identifier',
      value: '_baz',
      start: 8,
      end: 12
    })
  })

  it('should tokenize identifiers with $ and @ prefixes', () => {
    const result = tokenize('$var @decorator')
    expect(result.tokens).toHaveLength(2)
    expect(result.tokens[0].value).toBe('$var')
    expect(result.tokens[0].kind).toBe('identifier')
    expect(result.tokens[1].value).toBe('@decorator')
    expect(result.tokens[1].kind).toBe('identifier')
  })

  it('should tokenize numbers with decimals', () => {
    const result = tokenize('42 3.14 .5')
    expect(result.tokens).toHaveLength(3)
    expect(result.tokens[0]).toEqual({
      kind: 'number',
      value: '42',
      start: 0,
      end: 2
    })
    expect(result.tokens[1]).toEqual({
      kind: 'number',
      value: '3.14',
      start: 3,
      end: 7
    })
    expect(result.tokens[2]).toEqual({
      kind: 'number',
      value: '.5',
      start: 8,
      end: 10
    })
  })

  it('should tokenize double-quoted strings', () => {
    const result = tokenize('"hello world"')
    expect(result.tokens).toHaveLength(1)
    expect(result.tokens[0]).toEqual({
      kind: 'string',
      value: '"hello world"',
      start: 0,
      end: 13
    })
  })

  it('should tokenize single-quoted strings', () => {
    const result = tokenize("'test'")
    expect(result.tokens).toHaveLength(1)
    expect(result.tokens[0].value).toBe("'test'")
    expect(result.tokens[0].kind).toBe('string')
  })

  it('should tokenize template literals', () => {
    const result = tokenize('`template`')
    expect(result.tokens).toHaveLength(1)
    expect(result.tokens[0].value).toBe('`template`')
    expect(result.tokens[0].kind).toBe('string')
  })

  it('should handle escaped characters in strings', () => {
    const result = tokenize('"escaped \\" quote"')
    expect(result.tokens).toHaveLength(1)
    expect(result.tokens[0].value).toBe('"escaped \\" quote"')
  })

  it('should tokenize single-line comments', () => {
    const result = tokenize('code // comment')
    expect(result.tokens).toHaveLength(2)
    expect(result.tokens[0].value).toBe('code')
    expect(result.tokens[1]).toEqual({
      kind: 'comment',
      value: '// comment',
      start: 5,
      end: 15
    })
  })

  it('should tokenize multi-line comments', () => {
    const result = tokenize('/* comment */ code')
    expect(result.tokens).toHaveLength(2)
    expect(result.tokens[0]).toEqual({
      kind: 'comment',
      value: '/* comment */',
      start: 0,
      end: 13
    })
    expect(result.tokens[1].value).toBe('code')
  })

  it('should tokenize single-char symbols', () => {
    const result = tokenize('=> ++ -- !==')
    expect(result.tokens).toHaveLength(9)
    expect(result.tokens[0].value).toBe('=')
    expect(result.tokens[1].value).toBe('>')
    expect(result.tokens[2].value).toBe('+')
    expect(result.tokens[3].value).toBe('+')
    expect(result.tokens[4].value).toBe('-')
    expect(result.tokens[5].value).toBe('-')
    expect(result.tokens[6].value).toBe('!')
    expect(result.tokens[7].value).toBe('=')
    expect(result.tokens[8].value).toBe('=')
  })

  it('should record whitespace between tokens', () => {
    const result = tokenize('a  b\tc\nd')
    expect(result.precedingWs).toEqual(['', '  ', '\t', '\n'])
  })

  it('should treat \\r and \\n as whitespace', () => {
    const result = tokenize('a\r\nb\rc')
    expect(result.tokens).toHaveLength(3)
    expect(result.precedingWs).toEqual(['', '\r\n', '\r'])
  })

  it('should handle empty input', () => {
    const result = tokenize('')
    expect(result.tokens).toHaveLength(0)
    expect(result.precedingWs).toHaveLength(0)
  })

  it('should handle whitespace-only input', () => {
    const result = tokenize('   \n\t  ')
    expect(result.tokens).toHaveLength(0)
  })

  it('should tokenize mixed constructs', () => {
    const result = tokenize('const x = "hello" + 42')
    expect(result.tokens).toHaveLength(6)
    expect(result.tokens[0]).toEqual({
      kind: 'identifier',
      value: 'const',
      start: 0,
      end: 5
    })
    expect(result.tokens[1]).toEqual({
      kind: 'identifier',
      value: 'x',
      start: 6,
      end: 7
    })
    expect(result.tokens[2]).toEqual({
      kind: 'symbol',
      value: '=',
      start: 8,
      end: 9
    })
    expect(result.tokens[3]).toEqual({
      kind: 'string',
      value: '"hello"',
      start: 10,
      end: 17
    })
    expect(result.tokens[4]).toEqual({
      kind: 'symbol',
      value: '+',
      start: 18,
      end: 19
    })
    expect(result.tokens[5]).toEqual({
      kind: 'number',
      value: '42',
      start: 20,
      end: 22
    })
  })
})

describe('findLooseMatch', () => {
  it('should find exact match', () => {
    const file = 'const x = 42'
    const old = 'const x = 42'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 12 })
  })

  it('should match with extra whitespace between symbols', () => {
    const file = 'x = 42'
    const old = 'x=42'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 6 })
  })

  it('should match with no whitespace between symbols', () => {
    const file = 'x=42'
    const old = 'x = 42'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 4 })
  })

  it('should require whitespace between identifiers', () => {
    const file = 'foo bar'
    const old = 'foobar'
    const result = findLooseMatch(file, old)
    expect(result).toBeNull()
  })

  it('should require whitespace between identifier and number', () => {
    const file = 'x 42'
    const old = 'x42'
    const result = findLooseMatch(file, old)
    expect(result).toBeNull()
  })

  it('should match arrow function with spacing variations', () => {
    const file = '(x) => x'
    const old = '(x)=>x'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 8 })
  })

  it('should match arrow function without spaces', () => {
    const file = '(x)=>x'
    const old = '(x) => x'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 6 })
  })

  it('should match increment operator with variations', () => {
    const file = 'i + +'
    const old = 'i++'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 5 })
  })

  it('should match compound operators', () => {
    const file = 'x += 5'
    const old = 'x+=5'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 6 })
  })

  it('should match comparison operators', () => {
    const file = 'a !== b'
    const old = 'a!==b'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 7 })
  })

  it('should require exact string match', () => {
    const file = '"hello" "world"'
    const old = '"hello"'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 7 })
  })

  it('should not match different strings', () => {
    const file = '"hello"'
    const old = '"world"'
    const result = findLooseMatch(file, old)
    expect(result).toBeNull()
  })

  it('should require exact comment match', () => {
    const file = '// comment\ncode'
    const old = '// comment'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 10 })
  })

  it('should match in middle of file', () => {
    const file = 'before\nconst x = 42\nafter'
    const old = 'const x = 42'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 7, end: 19 })
  })

  it('should match with tabs and newlines', () => {
    const file = 'a\t+\nb'
    const old = 'a + b'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 5 })
  })

  it('should return null for no match', () => {
    const file = 'const x = 42'
    const old = 'const y = 42'
    const result = findLooseMatch(file, old)
    expect(result).toBeNull()
  })

  it('should handle empty old code', () => {
    const file = 'some code'
    const old = ''
    const result = findLooseMatch(file, old)
    expect(result).toBeNull()
  })

  it('should handle old code longer than file', () => {
    const file = 'x'
    const old = 'xyz'
    const result = findLooseMatch(file, old)
    expect(result).toBeNull()
  })

  it('should match complex expression with spacing variations', () => {
    const file = 'if (a && b || c)'
    const old = 'if(a&&b||c)'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 16 })
  })

  it('should match array access with variations', () => {
    const file = 'arr[0]'
    const old = 'arr [ 0 ]'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 6 })
  })

  it('should match object literal with variations', () => {
    const file = '{key: value}'
    const old = '{ key : value }'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 12 })
  })

  it('should match function call with variations', () => {
    const file = 'fn(1, 2, 3)'
    const old = 'fn ( 1 , 2 , 3 )'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 11 })
  })

  it('should match ternary operator with variations', () => {
    const file = 'a ? b : c'
    const old = 'a?b:c'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 9 })
  })

  it('should preserve exact character boundaries', () => {
    const file = '  x  =  42  '
    const old = 'x=42'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 2, end: 10 })
    expect(file.slice(result!.start, result!.end)).toBe('x  =  42')
  })

  it('should handle identifiers with underscores', () => {
    const file = 'my_var = 1'
    const old = 'my_var=1'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 10 })
  })

  it('should handle numbers with leading dot', () => {
    const file = '.5 + .3'
    const old = '.5+.3'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 7 })
  })

  it('should not match across line boundaries when whitespace is required', () => {
    const file = 'foo\nbar'
    const old = 'foo bar'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 7 })
  })

  it('should handle \\r\\n line endings', () => {
    const file = 'x = 5\r\ny = 10'
    const old = 'x = 5'
    const result = findLooseMatch(file, old)
    expect(result).toEqual({ start: 0, end: 5 })
  })

  it('should tokenize template literal with embedded expression', () => {
    const result = tokenize('`Hello ${name}!`')
    expect(result.tokens).toHaveLength(4)
    expect(result.tokens[0]).toEqual({
      kind: 'string',
      value: '`Hello ${',
      start: 0,
      end: 9
    })
    expect(result.tokens[1]).toEqual({
      kind: 'identifier',
      value: 'name',
      start: 9,
      end: 13
    })
    expect(result.tokens[2]).toEqual({
      kind: 'symbol',
      value: '}',
      start: 13,
      end: 14
    })
    expect(result.tokens[3]).toEqual({
      kind: 'string',
      value: '!`',
      start: 14,
      end: 16
    })
  })

  it('should tokenize template literal with multiple expressions', () => {
    const result = tokenize('`${a} and ${b}`')
    expect(result.tokens).toHaveLength(7)
    expect(result.tokens[0].value).toBe('`${')
    expect(result.tokens[1].value).toBe('a')
    expect(result.tokens[2].value).toBe('}')
    expect(result.tokens[3].value).toBe(' and ${')
    expect(result.tokens[4].value).toBe('b')
    expect(result.tokens[5].value).toBe('}')
    expect(result.tokens[6].value).toBe('`')
  })

  it('should tokenize nested template literals', () => {
    const result = tokenize('`outer ${`inner ${x}`} end`')
    expect(result.tokens).toHaveLength(7)
    expect(result.tokens.map((t) => t.kind)).toEqual([
      'string',
      'string',
      'identifier',
      'symbol',
      'string',
      'symbol',
      'string'
    ])
  })

  it('should tokenize Python f-string with expression', () => {
    const result = tokenize('f"Hello {name}!"')
    expect(result.tokens).toHaveLength(4)
    expect(result.tokens[0]).toEqual({
      kind: 'string',
      value: 'f"Hello {',
      start: 0,
      end: 9
    })
    expect(result.tokens[1].value).toBe('name')
    expect(result.tokens[1].kind).toBe('identifier')
    expect(result.tokens[2].value).toBe('}')
    expect(result.tokens[3].value).toBe('!"')
    expect(result.tokens[3].kind).toBe('string')
  })

  it('should tokenize raw f-string prefix', () => {
    const result = tokenize('rf"path\\{x}"')
    expect(result.tokens[0].value).toBe('rf"path\\{')
    expect(result.tokens[0].kind).toBe('string')
    expect(result.tokens[1].value).toBe('x')
  })

  it('should handle escaped braces in f-strings', () => {
    const result = tokenize('f"literal {{ braces }}"')
    expect(result.tokens).toHaveLength(1)
    expect(result.tokens[0].kind).toBe('string')
  })

  it('should not treat identifier followed by space+string as f-string', () => {
    const result = tokenize('f "hello"')
    expect(result.tokens).toHaveLength(2)
    expect(result.tokens[0]).toEqual({
      kind: 'identifier',
      value: 'f',
      start: 0,
      end: 1
    })
    expect(result.tokens[1]).toEqual({
      kind: 'string',
      value: '"hello"',
      start: 2,
      end: 9
    })
  })
})

describe('JavaScript/TypeScript patterns', () => {
  it('should match arrow function with spacing variations', () => {
    const file = 'const fn = (x, y) => x + y'
    const old = 'const fn=(x,y)=>x+y'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match destructuring assignment', () => {
    const file = 'const { a, b } = obj'
    const old = 'const {a,b}=obj'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match spread operator', () => {
    const file = 'const arr = [ ...items ]'
    const old = 'const arr=[...items]'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match optional chaining', () => {
    const file = 'obj ?. prop ?. method()'
    const old = 'obj?.prop?.method()'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match nullish coalescing', () => {
    const file = 'value ?? defaultVal'
    const old = 'value??defaultVal'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match template literal with expression', () => {
    const file = '`Hello ${ name }`'
    const old = '`Hello ${name}`'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match template literal without space in file but space in old', () => {
    const file = '`Hello ${name}`'
    const old = '`Hello ${ name }`'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match template literal with multiple expressions and drift', () => {
    const file = '`${ a + b } and ${ c * d }`'
    const old = '`${a+b} and ${c*d}`'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match template literal with nested expression', () => {
    const file = '`${ obj . method( x ) }`'
    const old = '`${obj.method(x)}`'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match class method', () => {
    const file = 'class Foo { method() { } }'
    const old = 'class Foo{method(){}}'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match async/await', () => {
    const file = 'async function fetchData() { await api.get() }'
    const old = 'async function fetchData(){await api.get()}'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })
})

describe('Python patterns', () => {
  it('should match function definition', () => {
    const file = 'def greet( name , age ):'
    const old = 'def greet(name,age):'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match list comprehension', () => {
    const file = 'result = [ x * 2 for x in range( 10 ) ]'
    const old = 'result=[x*2 for x in range(10)]'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match dictionary literal', () => {
    const file = 'data = { "key" : "value" }'
    const old = 'data={"key":"value"}'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match decorator', () => {
    const file = '@decorator\ndef func():'
    const old = '@decorator\ndef func():'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match f-string', () => {
    const file = 'f"Hello { name }"'
    const old = 'f"Hello {name}"'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match f-string without space in file but space in old', () => {
    const file = 'f"Hello {name}"'
    const old = 'f"Hello { name }"'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match f-string with expression arithmetic', () => {
    const file = 'f"total: { a + b }"'
    const old = 'f"total: {a+b}"'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match raw f-string with drift', () => {
    const file = 'rf"path\\{ name }"'
    const old = 'rf"path\\{name}"'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })
})

describe('Java patterns', () => {
  it('should match method declaration', () => {
    const file = 'public void method( int x , String y ) { }'
    const old = 'public void method(int x,String y){}'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match generic type', () => {
    const file = 'List < String > list = new ArrayList < String > ( )'
    const old = 'List<String> list=new ArrayList<String>()'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match lambda expression', () => {
    const file = 'list.forEach( item -> System.out.println( item ) )'
    const old = 'list.forEach(item->System.out.println(item))'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match try-catch', () => {
    const file = 'try { code( ) } catch ( Exception e ) { }'
    const old = 'try{code()}catch(Exception e){}'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match annotation', () => {
    const file = '@Override\npublic void method() { }'
    const old = '@Override\npublic void method(){}'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })
})

describe('C# patterns', () => {
  it('should match LINQ query', () => {
    const file = 'var result = from x in items where x > 0 select x'
    const old = 'var result=from x in items where x>0 select x'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match nullable type', () => {
    const file = 'int ? value = null'
    const old = 'int? value=null'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match async method', () => {
    const file = 'public async Task < int > GetDataAsync( )'
    const old = 'public async Task<int> GetDataAsync()'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match property', () => {
    const file = 'public string Name { get ; set ; }'
    const old = 'public string Name{get;set;}'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })
})

describe('Rust patterns', () => {
  it('should match function with return type', () => {
    const file = 'fn add( x : i32 , y : i32 ) -> i32'
    const old = 'fn add(x:i32,y:i32)->i32'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match pattern matching', () => {
    const file = 'match value { Some( x ) => x , None => 0 }'
    const old = 'match value{Some(x)=>x,None=>0}'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match closure', () => {
    const file = 'let add = | x , y | x + y'
    const old = 'let add=|x,y|x+y'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match struct definition', () => {
    const file = 'struct Point { x : f64 , y : f64 }'
    const old = 'struct Point{x:f64,y:f64}'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })
})

describe('Go patterns', () => {
  it('should match function with multiple returns', () => {
    const file = 'func divide( a , b float64 ) ( float64 , error )'
    const old = 'func divide(a,b float64)(float64,error)'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match goroutine', () => {
    const file = 'go func( ) { } ( )'
    const old = 'go func(){}()'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match channel operation', () => {
    const file = 'ch <- value'
    const old = 'ch<-value'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match struct initialization', () => {
    const file = 'p := Person { Name : "John" , Age : 30 }'
    const old = 'p:=Person{Name:"John",Age:30}'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })
})

describe('Ruby patterns', () => {
  it('should match symbol', () => {
    const file = '{ name : "value" }'
    const old = '{name:"value"}'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match block', () => {
    const file = 'array.each do | item | puts item end'
    const old = 'array.each do|item|puts item end'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match instance variable', () => {
    const file = '@name = value'
    const old = '@name=value'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })
})

describe('PHP patterns', () => {
  it('should match variable with $ prefix', () => {
    const file = '$var = "value"'
    const old = '$var="value"'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match array access', () => {
    const file = '$arr [ "key" ]'
    const old = '$arr["key"]'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match arrow operator', () => {
    const file = '$obj -> method( )'
    const old = '$obj->method()'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })
})

describe('SQL patterns', () => {
  it('should match SELECT statement', () => {
    const file = 'SELECT * FROM users WHERE id = 1'
    const old = 'SELECT * FROM users WHERE id=1'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match JOIN', () => {
    const file = 'LEFT JOIN orders ON users.id = orders.user_id'
    const old = 'LEFT JOIN orders ON users.id=orders.user_id'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })
})

describe('Edge cases', () => {
  it('should match when file has extra whitespace throughout', () => {
    const file = 'const    x   =   42   +   10'
    const old = 'const x = 42 + 10'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should match when old code has extra whitespace throughout', () => {
    const file = 'const x = 42 + 10'
    const old = 'const    x   =   42   +   10'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should preserve original whitespace in replacement', () => {
    const file = 'before\n  const   x  =  42\nafter'
    const old = 'const x = 42'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
    const extracted = file.slice(result!.start, result!.end)
    expect(extracted).toBe('const   x  =  42')
  })

  it('should match with mixed tabs and spaces', () => {
    const file = 'a\t+\t  b'
    const old = 'a + b'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
  })

  it('should not match partial identifiers', () => {
    const file = 'variable'
    const old = 'var'
    const result = findLooseMatch(file, old)
    expect(result).toBeNull()
  })

  it('should not match partial numbers', () => {
    const file = '42'
    const old = '4'
    const result = findLooseMatch(file, old)
    expect(result).toBeNull()
  })

  it('should match multiple occurrences - first one', () => {
    const file = 'x = 1\nx = 2\nx = 3'
    const old = 'x = 2'
    const result = findLooseMatch(file, old)
    expect(result).not.toBeNull()
    expect(result!.start).toBe(6)
  })
})
