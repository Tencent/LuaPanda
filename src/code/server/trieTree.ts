
// Trie树节点，内部类
class treeNode{
    thisChr;    //当前节点指示的字符（为了方便观察）
	childrenNode;	//字典，指向下一个孩子
	symbols;    //当前节点下挂的符号
	constructor(){
		this.childrenNode = new Object();
		this.symbols = new Array();
    }
}

// Trie树的构造， 查询， 添加（不需要删除）
export class trieTree {
    // 构建树，一个文件构建一棵树
    // @symbolArray 传入单个文件的符号列表，array类型 
    // @return 返回构建字典树的根节点
    public static createSymbolTree(symbolArray){
        if(!Array.isArray(symbolArray) || symbolArray.length === 0){
            return;
        }
        let root : treeNode = new treeNode();
        root.thisChr = "TREE_ROOT";
        for (const symbol of symbolArray) {
            this.addNodeOnTrieTree( root , symbol);
        }
        return root;
    }

    // 在树上搜寻节点，这里使用的search方案是前缀搜索
    // @root 树根
    // @searchKey 要查找的key，类型是字符串
    // @searchChildren 是否查找子节点
    // @return 搜索到的符号列表 
    public static searchOnTrieTree(root , searchKey, searchChildren = true){
        if(!root || !searchKey || searchKey == ''){
            return;
        }

        let currentPtr = root;
        searchKey = searchKey.toLowerCase()
        let searchArray = searchKey.split('');

        for (let index = 0; index < searchArray.length; index++) {
            const it = searchArray[index];
            //遍历，树中没有此节点，说明皮配不上，返回
            if(!currentPtr.childrenNode[it] ){
               return;
            }
            //移动指针到第一个匹配的节点
            currentPtr = currentPtr.childrenNode[it];
            //当指向最后一个字母的时候，把节点挂上
            if(index === searchArray.length - 1){
                //继续向下遍历所有节点，把结果列出来
                let searchResult = this.travelAllNode(currentPtr, searchChildren);
                return searchResult;
            }
        }
    }
    
    // 在树上搜寻节点，查到对应节点后，不再查找子节点。比如搜索a.b 那么可以查到a.bc ,但是查不出a.bc.d
    // @root 树根
    // @searchKey 要查找的key，类型是字符串
    // @return 搜索到的符号列表 
    public static searchOnTrieTreeWithoutTableChildren(root , searchKey){
        return this.searchOnTrieTree(root , searchKey, false)
    }

    // 内部方法，在树上增加节点
    // @root 树根
    // @symbol 单个符号名
    private static addNodeOnTrieTree(root , symbol){
        let currentPtr = root;
        let searchName = symbol.searchName.toLowerCase();
        let searchArray = searchName.split('');
        for (let index = 0; index < searchArray.length; index++) {
            const it = searchArray[index];
            //遍历，没有则创建
            if(!currentPtr.childrenNode[it] ){
               let newNode : treeNode = new treeNode();
               newNode.thisChr = it;
               currentPtr.childrenNode[it] = newNode;
            }
            //移动指针
            currentPtr = currentPtr.childrenNode[it];
            //当指向最后一个字母的时候，把节点挂上
            if(index === searchArray.length - 1){
                currentPtr.symbols.push(symbol);
            }
        }
    }

    // 递归遍历节点
    // @node 当前节点
    // @searchChildren 是否查找子节点
    private static travelAllNode(node, searchChildren){
        let retArray;
        // 加上自身节点的数据
        if(node.symbols && node.symbols.length > 0){
            retArray = node.symbols;
        }
        // 去遍历子节点
        for (const key in node.childrenNode) {
            const element = node.childrenNode[key];
            let childArray  = []
            if (searchChildren === false && (element.thisChr === '.' || element.thisChr === ':')){
                //不再遍历孩子
            }else{
                childArray = this.travelAllNode(element, searchChildren);
            }

            if(retArray == undefined){
                retArray = childArray;
            }else{
                retArray = retArray.concat(childArray);   
            }
        }

        return retArray;
    }
}

