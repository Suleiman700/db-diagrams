# 🎯 DB Diagrams

An interactive database diagram tool for visualizing and managing SQL table relationships. Create, edit, and export database schemas with an intuitive drag-and-drop interface.

![chrome_GF5XhX2rj7](https://github.com/user-attachments/assets/749e3907-98e0-425b-bda1-8079c1e8aa5a)

![chrome_jW4mrgPwWg](https://github.com/user-attachments/assets/46d44111-024b-434a-9fd3-c3be95af9114)

https://github.com/user-attachments/assets/20a4a891-7279-484e-a603-db7a930cd62a

## ✨ Features

### 📊 Table Management
- **Interactive SQL Editor**: 📝 Real-time SQL code editing with automatic diagram updates
- **Drag and Drop**: 🖱️ Easily position tables by dragging them around the canvas
- **Table Locking**: 🔒 Lock tables in place to prevent accidental movement
- **Auto-Layout**: 🎨 Reset table positions with automatic layout optimization
- **Zoom Controls**: 🔍 Zoom in/out to focus on specific areas or view the entire schema

### 🔗 Relationship Visualization
- **Automatic Relationships**: 🤝 Foreign key relationships are automatically detected and displayed
- **Visual Connections**: ⚡ Clear visual lines showing table relationships
- **Field Highlighting**: 🌟 Highlight connected fields when selecting relationships

### 💾 Schema Management
- **Local Storage**: 💿 Auto-saves your work to prevent data loss
- **Undo/Redo**: ↩️ Full undo/redo support for all diagram changes
- **Export Options**: 📤
  - Export as SQL schema
  - Export as PNG image

### 🎨 User Interface
- **Modern Design**: 💅 Clean, modern interface with dark mode editor
- **Responsive Layout**: 📱 Split-screen view with adjustable panels
- **Grid Background**: 📏 Visual grid for precise table positioning
- **Status Updates**: 📊 Real-time status indicators for auto-saving and changes

### 🛠️ Technical Features
- **SQL Parsing**: ⚙️ Automatic parsing of SQL CREATE TABLE statements
- **Error Handling**: ⚠️ Visual error indicators for invalid SQL syntax
- **Canvas Navigation**: 🗺️ Pan and zoom controls for large diagrams
- **Cross-browser Support**: 🌐 Works in all modern browsers

## 🚀 Getting Started

1. Open the application in your browser
2. Enter your SQL CREATE TABLE statements in the left panel
3. The diagram will automatically update as you type
4. Drag tables to arrange them
5. Use the toolbar buttons to:
   - 🔄 Reset the layout
   - 📥 Export your diagram
   - ↩️ Undo/redo changes
   - 🔒 Lock/unlock tables

## 💡 Usage Tips

- Use the mouse wheel or zoom controls to zoom in/out
- Click and drag on empty space to pan the canvas
- Click a relationship line to highlight connected fields
- Use Ctrl+Z and Ctrl+Y for undo/redo

## 📝 Example SQL

```plaintext
Table Users {
  id int [pk]
  username varchar(50)
  role varchar(10)
  created_at timestamp
}

Table Posts {
  id int [pk]
  user_id int [ref: > Users.id]
  title varchar(100) [note: The title of the post]
  created_at timestamp
}
```

```plaintext
Table Products {
  id int [pk]
  name varchar(100)
  description text [note: 'Detailed product description']
  price decimal(10,2)
  stock_quantity int
  category varchar(50)
  is_active boolean
  created_at timestamp
}

Table Orders {
  id int [pk]
  product_id int [ref: > Products.id]
  quantity int [note: 'Number of items ordered']
  total_price decimal(10,2)
  status varchar(20)
  shipping_address text
  created_at timestamp
}
```
