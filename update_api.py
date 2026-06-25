with open('frontend/src/api.js', 'r') as f:
    content = f.read()
content = content.replace('"/api/', '"/calstud/api/')
content = content.replace('`/api/', '`/calstud/api/')
with open('frontend/src/api.js', 'w') as f:
    f.write(content)
