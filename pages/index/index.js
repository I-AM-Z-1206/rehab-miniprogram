// index.js
const STORAGE_KEY = 'todo_list'

Page({
  data: {
    inputValue: '',
    // all / active / done
    filter: 'all',
    todos: [],
    filteredTodos: [],
    remaining: 0
  },

  onLoad() {
    this.loadTodos()
  },

  onShow() {
    this.loadTodos()
  },

  // ---------- 数据加载与保存 ----------
  loadTodos() {
    let todos = []
    try {
      todos = wx.getStorageSync(STORAGE_KEY) || []
    } catch (e) {
      todos = []
    }
    this.setData({ todos })
    this.refreshView()
  },

  saveTodos() {
    try {
      wx.setStorageSync(STORAGE_KEY, this.data.todos)
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  refreshView() {
    const { todos, filter } = this.data
    const filteredTodos = todos.filter((t) => {
      if (filter === 'active') return !t.done
      if (filter === 'done') return t.done
      return true
    })
    const remaining = todos.filter((t) => !t.done).length
    this.setData({ filteredTodos, remaining })
  },

  // ---------- 事件处理 ----------
  onInput(e) {
    this.setData({ inputValue: e.detail.value })
  },

  addTodo() {
    const text = (this.data.inputValue || '').trim()
    if (!text) {
      wx.showToast({ title: '请输入内容', icon: 'none' })
      return
    }
    const todos = this.data.todos.concat({
      id: Date.now() + '_' + Math.floor(Math.random() * 1000),
      text,
      done: false,
      createdAt: Date.now()
    })
    this.setData({ todos, inputValue: '' })
    this.saveTodos()
    this.refreshView()
  },

  toggleTodo(e) {
    const id = e.currentTarget.dataset.id
    const todos = this.data.todos.map((t) =>
      t.id === id ? { ...t, done: !t.done } : t
    )
    this.setData({ todos })
    this.saveTodos()
    this.refreshView()
  },

  removeTodo(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除待办',
      content: '确定要删除这条待办吗？',
      success: (res) => {
        if (!res.confirm) return
        const todos = this.data.todos.filter((t) => t.id !== id)
        this.setData({ todos })
        this.saveTodos()
        this.refreshView()
      }
    })
  },

  clearDone() {
    const doneCount = this.data.todos.filter((t) => t.done).length
    if (doneCount === 0) {
      wx.showToast({ title: '没有已完成项', icon: 'none' })
      return
    }
    wx.showModal({
      title: '清除已完成',
      content: `确定清除 ${doneCount} 条已完成的待办吗？`,
      success: (res) => {
        if (!res.confirm) return
        const todos = this.data.todos.filter((t) => !t.done)
        this.setData({ todos })
        this.saveTodos()
        this.refreshView()
      }
    })
  },

  setFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ filter })
    this.refreshView()
  },

  // ---------- 页面跳转 ----------
  goSensor() {
    wx.navigateTo({ url: '/pages/sensor/sensor' })
  }
})
