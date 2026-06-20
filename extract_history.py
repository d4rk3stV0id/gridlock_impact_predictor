import json

transcript_path = r'C:\Users\rocho\.gemini\antigravity-ide\brain\446b6e90-687e-4e92-886a-fe9ad99c600f\.system_generated\logs\transcript.jsonl'
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        if 'index.html' in line and '"type":"VIEW_FILE_RESPONSE"' in line:
            data = json.loads(line)
            content = data.get('content', '')
            if 'feedStatus' in content:
                print(content)
                break
