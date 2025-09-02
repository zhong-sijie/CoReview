// 为动态别名添加类型声明
declare module 'app-component' {
  import type { ComponentType } from 'react';
  const App: ComponentType;
  export default App;
}
