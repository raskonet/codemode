import Editor from "@monaco-editor/react";

interface Props {
  language: "java" | "cpp" | "python";
  value: string;
  onChange: (code: string) => void;
}

export default function CodeEditor({ language, value, onChange }: Props) {
  const handleChange = (currentValue: string | undefined) => {
    onChange(currentValue || "");
  };

  const handleMount = (editor: any, _monacoInstance: any) => {
    editor.focus();
  };

  return (
    <Editor
      height="100vh"
      width="100vh"
      defaultLanguage={language}
      language={language}
      value={value}
      theme="vs-dark"
      onChange={handleChange}
      onMount={handleMount}
      options={{
        automaticLayout: true,
        minimap: { enabled: false },
        wordWrap: "on",
        fontSize: 14,
        scrollBeyondLastLine: false,
        scrollbar: {
          verticalScrollbarSize: 8,
          horizontalScrollbarSize: 8,
        },
        cursorSmoothCaretAnimation: "on",
        smoothScrolling: true,
      }}
    />
  );
}
